import {mkdtemp, readFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {SessionsService} from "@supernova/agent-runtime/services/sessions/sessions-service";
import {createPiTestRuntime, selectedModelReference} from "@tests/implementations/pi/sessions/pi-session-test-utils";

describe("Pi sessions service", () => {
  const runtimes: Array<{unregister: () => void}> = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
  });

  it("creates a persisted empty session", async () => {
    const pi = createPiTestRuntime({sessionDir: await mkdtemp(join(tmpdir(), "supernova-sessions-"))});
    runtimes.push(pi);

    const session = await pi.runWithSessions(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.create("/workspace");
      })
    );
    const created = pi.getSession(session.id);

    expect(session).toMatchObject({id: session.id, projectPath: "/workspace", title: "New session", turns: []});
    const header = JSON.parse(await readFile(created?.info.path ?? "", "utf8"));
    expect(header).toMatchObject({cwd: "/workspace", id: session.id, timestamp: session.updatedAt, type: "session"});
  });

  it("loads turns from raw branch history instead of compacted context", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession();
    manager.appendModelChange(selectedModelReference.providerId, selectedModelReference.id);
    manager.appendThinkingLevelChange("high");
    pi.appendConversation(manager, {assistantText: "Original answer", requestText: "Before compaction"});
    manager.appendCompaction("Summary that should not render", "recent-user", 1000);
    pi.appendConversation(manager, {assistantText: "Recent answer", requestText: "After compaction"});

    const session = await pi.runWithSessions(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.get(info.id);
      })
    );

    expect(session.turns).toMatchObject([
      {events: [{content: "Original answer", type: "assistant"}], userMessage: {contentParts: [{text: "Before compaction", type: "text"}]}},
      {events: [{content: "Recent answer", type: "assistant"}], userMessage: {contentParts: [{text: "After compaction", type: "text"}]}},
    ]);
  });

  it("refreshes credentials and model metadata before listing models", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);

    const models = await pi.runWithSessions(
      Effect.gen(function* () {
        const sessions = yield* SessionsService;
        return yield* sessions.listModels();
      })
    );

    expect(pi.refreshCount).toBe(1);
    expect(models).toMatchObject([{id: "claude-sonnet", name: "Claude Sonnet", providerId: "anthropic", providerName: "Anthropic"}]);
  });
});
