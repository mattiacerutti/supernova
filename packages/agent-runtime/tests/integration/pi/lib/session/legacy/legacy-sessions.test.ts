import {existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import type {Message} from "@earendil-works/pi-ai";
import {cleanupTempDirs} from "@tests/support/async";
import {assistantTexts, createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents} from "@tests/support/session-runtime";

const PROJECT = "/workspace/app";
const PROJECT_DIR = "--workspace-app--";

/** Builds an old session file: a header, then entries chained by `parentId` unless an entry names its parent. */
function oldSession(id: string, entries: readonly Record<string, unknown>[], cwd = PROJECT): string {
  let previous: string | null = null;
  const lines = entries.map((entry, index) => {
    const line = {id: `e${index}`, parentId: previous, timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), ...entry};
    previous = line.id;
    return line;
  });
  return [{type: "session", version: 3, id, timestamp: "2026-01-01T00:00:00.000Z", cwd}, ...lines].map((line) => JSON.stringify(line)).join("\n") + "\n";
}

const at = (minute: number) => Date.UTC(2026, 0, 1, 0, minute);
const parts = (text: string) => ({type: "custom", customType: "supernova.user-message-content-parts", data: {contentParts: [{type: "text", text}]}});
const user = (text: string, minute: number) => ({type: "message", message: {role: "user", content: [{type: "text", text}], timestamp: at(minute)}});
const assistant = (content: readonly unknown[], minute: number, stopReason = "stop") => ({
  type: "message",
  message: {
    role: "assistant",
    content,
    api: "faux:test",
    provider: "anthropic",
    model: "claude-sonnet",
    usage: {input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0}},
    stopReason,
    timestamp: at(minute),
  },
});
const toolResult = (callId: string, text: string, minute: number) => ({
  type: "message",
  message: {role: "toolResult", toolCallId: callId, toolName: "read", content: [{type: "text", text}], isError: false, timestamp: at(minute)},
});
const checkpoint = (phase: string) => ({type: "custom", customType: "supernova.checkpoint", data: {checkpointId: crypto.randomUUID(), phase, status: "captured"}});

/** A two-turn session with a tool call, renamed, whose last turn was undone (so the branch ends before it). */
function toolSession(id: string): string {
  return oldSession(id, [
    {type: "model_change", provider: "anthropic", modelId: "claude-sonnet"},
    {type: "thinking_level_change", thinkingLevel: "high"},
    {type: "session_info", name: "Read the readme"},
    checkpoint("before-turn"),
    parts("What does the readme say?"),
    user("What does the readme say?", 5),
    assistant(
      [
        {type: "thinking", thinking: "Reading it."},
        {type: "toolCall", id: "call-1", name: "read", arguments: {path: "README.md"}},
      ],
      6,
      "toolUse"
    ),
    toolResult("call-1", "# App", 7),
    assistant([{type: "text", text: "It is titled App."}], 8),
    checkpoint("after-turn"),
    // The undone turn: a cursor moved back to the first turn's end, so the branch from the last entry skips it.
    checkpoint("before-turn"),
    parts("Undone question"),
    user("Undone question", 12),
    assistant([{type: "text", text: "Undone answer"}], 13),
    checkpoint("after-turn"),
    {type: "custom", customType: "supernova.checkpoint-cursor", data: {leafEntryId: "e9"}, parentId: "e9"},
  ]);
}

describe("importing the old SDK's sessions", () => {
  const dirs: string[] = [];
  afterEach(() => cleanupTempDirs(dirs));

  /** A sessions directory holding old project folders, as the previous release left it. */
  function oldSessionsDir(files: Readonly<Record<string, string>>): string {
    const root = join(mkdtempSync(join(tmpdir(), "supernova-legacy-")), "sessions");
    dirs.push(join(root, ".."));
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(join(root, path, ".."), {recursive: true});
      writeFileSync(join(root, path), content);
    }
    return root;
  }

  it("imports the visible branch's turns, messages, and tool calls, and the session continues from them", async () => {
    const root = oldSessionsDir({[`${PROJECT_DIR}/2026-01-01T00-00-00-000Z_old-1.jsonl`]: toolSession("old-1")});
    const pi = await createPiTestRuntime({sessionStorageRoot: root});
    try {
      const page = await pi.projects.listSessions({projectPath: PROJECT, limit: 5});
      expect(page.sessions.map((session) => [session.id, session.title])).toEqual([["old-1", "Read the readme"]]);

      const session = await pi.sessionRuntime.current("old-1");
      expect(session.entries.items.map((entry) => entry.kind)).toEqual(["pi.user", "pi.assistant", "pi.tool-result", "pi.assistant"]);
      expect(turnContents(session)).toEqual([[{type: "text", text: "What does the readme say?"}]]);
      expect(session.undone.items).toEqual([]);
      expect(session.agent.model).toEqual({provider: "anthropic", modelId: "claude-sonnet"});
      expect(session.agent.thinkingLevel).toBe("high");

      let seen: readonly Message[] = [];
      pi.faux.setResponses([
        (context) => {
          seen = context.messages as Message[];
          return fauxAssistantMessage("Continued.");
        },
      ]);
      const sent = await pi.sendMessage({sessionId: "old-1", message: "And then?", modelReference: selectedModelReference, captureCheckpoints: false});
      expect(sent.error).toBeNull();
      expect(seen.filter((message) => message.role !== "system").map((message) => message.role)).toEqual(["user", "assistant", "toolResult", "assistant", "user"]);
      expect(assistantTexts(sent.session)).toEqual(["", "It is titled App.", "Continued."]);

      // Imported turns have no workspace checkpoints, so undo moves the conversation only.
      await pi.sessionRuntime.undoCheckpoint({sessionId: "old-1"});
      await pi.sessionRuntime.undoCheckpoint({sessionId: "old-1"});
      expect(turnContents(await pi.sessionRuntime.current("old-1"))).toEqual([]);
    } finally {
      await pi.unregister();
    }
  });

  it.runIf(process.platform === "win32").each([
    {name: "drive", cwd: "C:\\Users\\Alice\\app", projectDir: "--C--Users-Alice-app--", projectPath: "C:/Users/Alice/app"},
    {name: "UNC", cwd: "\\\\server\\share\\app", projectDir: "---server-share-app--", projectPath: "//server/share/app"},
    {
      name: "worktree",
      cwd: "C:\\worktrees\\app",
      projectDir: "--C--Users-Alice-app--",
      projectPath: "C:/Users/Alice/app",
      worktree: {projectPath: "C:\\Users\\Alice\\app", worktree: {branch: "supernova/test", path: "C:\\worktrees\\app"}},
    },
  ])("lists and searches imported Windows $name sessions using the UI's path separators", async ({cwd, projectDir, projectPath, worktree}) => {
    const root = oldSessionsDir({
      [`${projectDir}/2026-01-01T00-00-00-000Z_windows.jsonl`]: oldSession(
        "windows",
        [...(worktree ? [{type: "custom", customType: "supernova.worktree", data: worktree}] : []), parts("Old question"), user("Old question", 1)],
        cwd
      ),
    });
    const pi = await createPiTestRuntime({sessionStorageRoot: root});
    try {
      expect((await pi.projects.listSessions({projectPath, limit: 5})).sessions.map((session) => session.id)).toEqual(["windows"]);
      expect((await pi.projects.searchSessions({projectPaths: [projectPath], query: "Old question", limit: 5})).sessions.map((session) => session.id)).toEqual(["windows"]);
      expect(turnContents(await pi.sessionRuntime.current("windows"))).toEqual([[{type: "text", text: "Old question"}]]);
      expect(existsSync(join(root, "legacy", projectDir, "2026-01-01T00-00-00-000Z_windows.jsonl"))).toBe(true);
    } finally {
      await pi.unregister();
    }
  });

  it("starts a compacted session's context at its summary and answers a call a crash left without a result", async () => {
    const root = oldSessionsDir({
      [`${PROJECT_DIR}/2026-01-01T00-00-00-000Z_old-2.jsonl`]: oldSession("old-2", [
        parts("Old question"),
        user("Old question", 1),
        assistant([{type: "text", text: "Old answer"}], 2),
        parts("Kept question"),
        user("Kept question", 4),
        assistant([{type: "text", text: "Kept answer"}], 5),
        {type: "compaction", summary: "They talked.", firstKeptEntryId: "e3", tokensBefore: 100},
        parts("Run a tool"),
        user("Run a tool", 8),
        assistant([{type: "toolCall", id: "call-2", name: "read", arguments: {path: "a"}}], 9, "toolUse"),
      ]),
    });
    const pi = await createPiTestRuntime({sessionStorageRoot: root});
    try {
      const session = await pi.sessionRuntime.current("old-2");
      expect(session.title).toBe("Old question");
      expect(turnContents(session).map((contentParts) => contentParts[0])).toEqual([
        {type: "text", text: "Old question"},
        {type: "text", text: "Kept question"},
        {type: "text", text: "Run a tool"},
      ]);
      const aborted = session.entries.items.at(-1)?.model?.[0];
      expect(aborted).toMatchObject({role: "toolResult", toolCallId: "call-2", isError: true});

      let seen: readonly Message[] = [];
      pi.faux.setResponses([
        (context) => {
          seen = context.messages as Message[];
          return fauxAssistantMessage("Done.");
        },
      ]);
      await pi.sendMessage({sessionId: "old-2", message: "Next", modelReference: selectedModelReference, captureCheckpoints: false});
      const texts = seen
        .filter((message) => message.role === "user")
        .map((message) => (typeof message.content === "string" ? message.content : message.content.map((part) => (part.type === "text" ? part.text : "")).join("")));
      expect(texts[0]).toContain("<summary>\nThey talked.\n</summary>");
      expect(texts.slice(1)).toEqual(["Kept question", "Run a tool", "Next"]);
    } finally {
      await pi.unregister();
    }
  });

  it("moves old project folders into legacy/ with their archives, imports nothing archived, and runs once", async () => {
    const root = oldSessionsDir({
      [`${PROJECT_DIR}/2026-01-01T00-00-00-000Z_old-1.jsonl`]: toolSession("old-1"),
      [`${PROJECT_DIR}/archive/2026-01-01T00-00-00-000Z_archived.jsonl`]: toolSession("archived"),
      [`${PROJECT_DIR}/2026-01-01T00-00-00-000Z_broken.jsonl`]: "not a session\n",
    });
    const first = await createPiTestRuntime({sessionStorageRoot: root});
    try {
      expect(await first.store.find("archived")).toBeUndefined();
      expect(await first.sessions.exists({sessionId: "archived"})).toBe(false);
      expect((await first.projects.listSessions({projectPath: PROJECT, limit: 5})).sessions.map((session) => session.id)).toEqual(["old-1"]);
      expect(
        readdirSync(root)
          .filter((name) => !name.startsWith("catalog.sqlite"))
          .toSorted()
      ).toEqual(["legacy", "old-1"]);
      expect(existsSync(join(root, "legacy", PROJECT_DIR, "archive", "2026-01-01T00-00-00-000Z_archived.jsonl"))).toBe(true);
      // A file that fails to import stays with its folder.
      expect(existsSync(join(root, "legacy", PROJECT_DIR, "2026-01-01T00-00-00-000Z_broken.jsonl"))).toBe(true);
      await first.sendMessage({sessionId: "old-1", message: "New turn", modelReference: selectedModelReference, captureCheckpoints: false});
    } finally {
      await first.unregister();
    }

    // The next start finds nothing to import and keeps what the session gained since.
    const second = await createPiTestRuntime({sessionStorageRoot: root});
    try {
      expect(turnContents(await second.sessionRuntime.current("old-1"))).toHaveLength(2);
      expect(readdirSync(join(root, "legacy"))).toEqual([PROJECT_DIR]);
    } finally {
      await second.unregister();
    }
  });

  it("keeps the folder of a new session whose id looks like an old project folder", async () => {
    const pi = await createPiTestRuntime();
    try {
      await pi.sessions.create({id: "--looks-old--", projectPath: pi.defaultProjectRoot});
      await pi.sessionRuntime.release({sessionId: "--looks-old--", workspacePath: pi.defaultProjectRoot});
      await pi.store.dispose();
      expect(await pi.store.find("--looks-old--")).toBeDefined();
      expect(existsSync(join(pi.sessionStorageRoot, "--looks-old--", "session.sqlite"))).toBe(true);
    } finally {
      await pi.unregister();
    }
  });
});
