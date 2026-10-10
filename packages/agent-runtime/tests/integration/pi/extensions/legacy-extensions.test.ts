import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fauxAssistantMessage, fauxToolCall} from "@earendil-works/pi-ai/compat";
import {afterEach, describe, expect, it} from "vitest";
import {createPiTestRuntime, selectedModelReference} from "@tests/support/session-runtime";

/**
 * An extension written for Pi's old SDK, as the old Supernova ran them in print mode: a tool, the headless events, a
 * `tool_call` rewrite, a `tool_result` rewrite, UI calls, and reads of `ctx`. It records what it saw to `logPath`.
 */
const FIXTURE = String.raw`
import {appendFileSync} from "node:fs";
import {Type} from "typebox";

export default function (pi) {
  const log = (line) => appendFileSync(process.env.SUPERNOVA_FIXTURE_LOG, line + "\n");

  pi.registerTool({
    name: "fixture_echo",
    label: "Echo",
    description: "Echoes its input",
    parameters: Type.Object({text: Type.String()}),
    execute: async (_id, args, _signal, _update, ctx) => {
      // The old print-mode context: no UI, dialogs answer "no", and the model is known.
      log("tool:" + args.text + ":" + ctx.hasUI + ":" + ctx.mode + ":" + (await ctx.ui.confirm("?", "?")) + ":" + ctx.model?.provider);
      ctx.ui.setStatus("fixture", "working");
      return {content: [{type: "text", text: "echo " + args.text}], details: {}};
    },
  });

  pi.on("session_start", (event, ctx) => {
    ctx.ui.setStatus("fixture", "started");
    log("session_start:" + event.reason + ":" + ctx.cwd);
  });
  pi.on("session_shutdown", (event) => log("session_shutdown:" + event.reason));
  pi.on("tool_call", (event) => {
    log("tool_call:" + event.toolName);
    if (event.toolName === "fixture_echo") event.input.text = event.input.text + "!";
  });
  pi.on("tool_result", (event) => {
    log("tool_result:" + event.toolName);
    return {content: [{type: "text", text: "rewritten"}]};
  });
  pi.on("context", (event) => {
    log("context:" + event.messages.length);
  });
  for (const event of ["before_agent_start", "agent_start", "turn_start", "message_start", "message_end", "turn_end", "agent_end", "agent_settled", "tool_execution_start", "tool_execution_end"]) {
    pi.on(event, (e) => log(event + (e.turnIndex === undefined ? "" : ":" + e.turnIndex)));
  }
  pi.on("session_before_compact", (event) => {
    log("session_before_compact:" + event.reason);
    if (event.customInstructions === "cancel") return {cancel: true};
  });
  // Not delivered by the engine; reported, never fired.
  pi.on("message_update", () => log("message_update"));
  pi.registerCommand("fixture", {description: "A command", handler: async () => {}});
}
`;

describe("old-SDK extensions", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    delete process.env.SUPERNOVA_FIXTURE_LOG;
    await Promise.all(dirs.map((dir) => rm(dir, {recursive: true, force: true})));
    dirs.length = 0;
  });

  it("runs headless as the old Supernova did: tools, hook events, no-op UI, and reports what it cannot deliver", async () => {
    const dir = await mkdtemp(join(tmpdir(), "supernova-extension-"));
    dirs.push(dir);
    const extensionPath = join(dir, "fixture.ts");
    const logPath = join(dir, "log.txt");
    process.env.SUPERNOVA_FIXTURE_LOG = logPath;
    await writeFile(extensionPath, FIXTURE);
    await writeFile(logPath, "");

    const pi = await createPiTestRuntime({extensionPaths: [extensionPath], settings: {compaction: {enabled: false, keepRecentTokens: 1}}});
    try {
      const {info} = await pi.createSession();
      pi.faux.setResponses([fauxAssistantMessage(fauxToolCall("fixture_echo", {text: "hi"}), {stopReason: "toolUse"}), fauxAssistantMessage("Done.")]);
      const {session} = await pi.sendMessage({message: "Echo hi", modelReference: selectedModelReference, sessionId: info.id});

      // The tool ran with the `tool_call` rewrite, and its result was replaced by `tool_result`.
      const toolResult = session.entries.find((entry) => entry.kind === "pi.tool-result");
      expect(toolResult?.model?.[0]).toMatchObject({role: "toolResult", toolName: "fixture_echo", content: [{type: "text", text: "rewritten"}]});

      const lines = (await readFile(logPath, "utf8")).trim().split("\n");
      expect(lines[0]).toMatch(/^session_start:startup:/);
      // The old agent loop's order: a run starts, each response is a turn, tools run between, the final answer ends it.
      // `context` sees the request's messages (system prompt included); the tool sees the rewritten argument and a model.
      expect(lines.slice(1)).toEqual([
        "before_agent_start",
        "agent_start",
        "context:2",
        "turn_start:0",
        "message_start",
        "message_end",
        "turn_end:0",
        "tool_call:fixture_echo",
        "tool_execution_start",
        `tool:hi!:false:print:false:${selectedModelReference.providerId}`,
        "tool_execution_end",
        "tool_result:fixture_echo",
        "context:4",
        "turn_start:1",
        "message_start",
        "message_end",
        "turn_end:1",
        "agent_end",
        "agent_settled",
      ]);

      // A manual compaction asks the extension first, which may cancel it.
      await writeFile(logPath, "");
      pi.faux.setResponses([fauxAssistantMessage("Summary")]);
      await pi.sessionRuntime.compact({modelReference: selectedModelReference, sessionId: info.id});
      expect((await readFile(logPath, "utf8")).trim()).toBe("session_before_compact:manual");
      expect((await pi.sessionRuntime.current(info.id)).entries.at(-1)?.kind).toBe("pi.compaction");

      // What Supernova cannot deliver is reported once, not silently dropped.
      expect(pi.reports.some((message) => message.includes("fixture.ts") && message.includes('subscribes to "message_update"'))).toBe(true);
      expect(pi.reports.some((message) => message.includes("fixture.ts") && message.includes("registers commands (fixture)"))).toBe(true);
    } finally {
      await pi.unregister();
    }
    expect((await readFile(logPath, "utf8")).trim().split("\n").at(-1)).toBe("session_shutdown:quit");
  });
});
