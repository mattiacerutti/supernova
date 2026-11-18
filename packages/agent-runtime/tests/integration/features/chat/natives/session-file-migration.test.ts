import {existsSync, mkdirSync, mkdtempSync} from "node:fs";
import {tmpdir} from "node:os";
import {join, sep} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {createModels} from "@earendil-works/pi-ai/models";
import type {Conversation, JsonObject} from "@earendil-works/pi-durable";
import {createRegistry, defineDoc, Harness} from "@earendil-works/pi-durable";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import {SessionCatalog} from "@supernova/agent-runtime/features/sessions/natives/session-catalog";
import {cleanupTempDirs} from "@tests/support/async";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel, turnContents, undoneContents} from "@tests/support/test-runtime";

const SESSION_ID = "old-session";

/** Version 1: each turn a `pi.user` entry with a record in the state holding what the user wrote; undo moved `leaf`. */
const VersionOneState = defineDoc<JsonObject>({kind: "supernova.session", version: 1, scope: "session", initial: () => ({branch: 1, turns: {}}), checkpointWhen: () => true});
const ctx = BACKGROUND_CONTEXT;

async function writeVersionOne(path: string, build: (harness: Harness, root: Conversation) => Promise<JsonObject>): Promise<void> {
  const harness = await Harness.open(await openNodeSqliteStorage(path), {models: createModels(), registry: createRegistry()}, ctx);
  try {
    const root = await harness.root(ctx, {agent: {model: {provider: selectedPiModel.provider, modelId: selectedPiModel.id}}});
    const state = await build(harness, root);
    await harness.commit(async (tx) => void Object.assign(await tx.doc(VersionOneState), state), ctx);
  } finally {
    await harness.close(ctx);
  }
}

async function appendTurns(conversation: Conversation, texts: readonly string[]): Promise<number[]> {
  const ids: number[] = [];
  await conversation.commit(async (tx) => {
    for (const text of texts) {
      ids.push((await tx.appendEntry(conversation.id, {kind: "pi.user", model: [{role: "user", content: text, timestamp: 0}]})).id);
      await tx.appendEntry(conversation.id, {kind: "pi.assistant", model: [fauxAssistantMessage(`Answer to ${text}`)]});
    }
  }, ctx);
  return ids;
}

function turnRecords(sessionId: string, entries: Readonly<Record<number, string>>): JsonObject {
  const boundary = {checkpointId: "c", sessionId, status: "disabled"};
  return Object.fromEntries(Object.entries(entries).map(([id, text]) => [id, {contentParts: [{type: "text", text}], capture: false, before: boundary, after: boundary}]));
}

describe("a version 1 session file", () => {
  const tempDirs: string[] = [];
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
    cleanupTempDirs(tempDirs);
  });

  async function opened(build: Parameters<typeof writeVersionOne>[1]) {
    const root = mkdtempSync(join(tmpdir(), "supernova-turn-entries-"));
    const projectPath = mkdtempSync(join(tmpdir(), "supernova-turn-entries-project-")).split(sep).join("/");
    tempDirs.push(root, projectPath);
    mkdirSync(join(root, SESSION_ID));
    await writeVersionOne(join(root, SESSION_ID, "session.sqlite"), build);
    const catalog = await SessionCatalog.open(join(root, "catalog.sqlite"));
    const now = new Date().toISOString();
    catalog.insert({id: SESSION_ID, projectPath, title: "Old session", pinned: false, createdAt: now, updatedAt: now});
    catalog.close();
    const pi = await createPiTestRuntime({sessionStorageRoot: root});
    runtimes.push(pi);
    return {pi, root, session: await pi.sessions.get({sessionId: SESSION_ID})};
  }

  it("keeps only the branch's turns, though the state still has another one's, and keeps the old file", async () => {
    // A send after undoing every turn started a new branch, and left the old one's turn record behind.
    const {pi, root, session} = await opened(async (harness, root) => {
      const [first] = await appendTurns(root, ["Remember the number 2"]);
      const restarted = await harness.createConversation({ownership: {kind: "ownerless"}}, ctx);
      const [second, third] = await appendTurns(restarted, ["What was the number?", "hello"]);
      return {branch: restarted.id, turns: turnRecords(SESSION_ID, {[first!]: "Remember the number 2", [second!]: "What was the number?", [third!]: "hello"})};
    });

    expect(turnContents(session)).toEqual([[{type: "text", text: "What was the number?"}], [{type: "text", text: "hello"}]]);
    expect(session.entries.remaining).toBe(0);
    expect(session.undone.items).toEqual([]);
    expect(existsSync(join(root, SESSION_ID, "session.pre-migration.sqlite"))).toBe(true);

    pi.faux.setResponses([fauxAssistantMessage("Answer")]);
    const {session: continued} = await pi.sendMessage({message: "Next", modelReference: selectedModelReference, sessionId: SESSION_ID, captureCheckpoints: false});
    expect(turnContents(continued).at(-1)).toEqual([{type: "text", text: "Next"}]);
  });

  it("keeps the undone turns after the undo point, and redo brings them back", async () => {
    const {pi, session} = await opened(async (_harness, root) => {
      const ids = await appendTurns(root, ["One", "Two", "Three"]);
      return {branch: root.id, leaf: ids[0]! + 1, turns: turnRecords(SESSION_ID, {[ids[0]!]: "One", [ids[1]!]: "Two", [ids[2]!]: "Three"})};
    });

    expect(turnContents(session)).toEqual([[{type: "text", text: "One"}]]);
    expect(undoneContents(session)).toEqual([[{type: "text", text: "Two"}], [{type: "text", text: "Three"}]]);
    expect(session.undone.remaining).toBe(0);

    // The migration keeps no model history, so a fork before its entries has the session's model.
    await pi.chat.undoCheckpoint({sessionId: SESSION_ID});
    expect((await pi.chat.current(SESSION_ID)).agent).toMatchObject({model: {modelId: selectedPiModel.id}});
    for (let turn = 0; turn < 3; turn++) await pi.chat.redoCheckpoint({sessionId: SESSION_ID});
    expect(turnContents(await pi.chat.current(SESSION_ID)).map((parts) => parts[0])).toEqual([
      {type: "text", text: "One"},
      {type: "text", text: "Two"},
      {type: "text", text: "Three"},
    ]);
  });

  it("keeps every turn undone when nothing was shown, and the next message starts over with the session's model", async () => {
    const {pi, session} = await opened(async (_harness, root) => {
      const ids = await appendTurns(root, ["One", "Two"]);
      return {branch: root.id, leaf: null, turns: turnRecords(SESSION_ID, {[ids[0]!]: "One", [ids[1]!]: "Two"})};
    });

    expect(turnContents(session)).toEqual([]);
    expect(undoneContents(session)).toEqual([[{type: "text", text: "One"}], [{type: "text", text: "Two"}]]);
    expect(session.agent).toMatchObject({model: {modelId: selectedPiModel.id}});

    pi.faux.setResponses([fauxAssistantMessage("Answer")]);
    const {session: continued} = await pi.sendMessage({message: "Again", modelReference: selectedModelReference, sessionId: SESSION_ID, captureCheckpoints: false});
    expect(turnContents(continued)).toEqual([[{type: "text", text: "Again"}]]);
    expect(continued.undone.items).toEqual([]);
  });
});
