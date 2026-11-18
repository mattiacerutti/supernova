import {existsSync} from "node:fs";
import {rename, rm} from "node:fs/promises";
import type {Context} from "@earendil-works/chord/context";
import {createModels} from "@earendil-works/pi-ai/models";
import type {ConversationId, EntryDraft, EntryId, EntryRecord, JsonObject, Storage} from "@earendil-works/pi-durable";
import {AgentDoc, createRegistry, Harness, ROOT_CONVERSATION_ID, UsageDoc} from "@earendil-works/pi-durable";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import type {UserEntryData, UserMessageContentPart} from "@supernova/contracts/services/chat/schemas";
import {USER_ENTRY_KIND} from "@supernova/contracts/services/chat/schemas";
import type {CheckpointRef, SessionState, TurnCheckpoints} from "@supernova/agent-runtime/core/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";

interface OldTurnRecord extends TurnCheckpoints {
  readonly contentParts: UserMessageContentPart[];
}

interface OldState {
  readonly branch?: ConversationId;
  /** The last shown entry of `branch`: absent at its end, `null` when nothing is shown. */
  readonly leaf?: number | null;
  readonly current?: CheckpointRef;
  readonly turns?: Readonly<Record<string, OldTurnRecord>>;
}

interface OldConversation {
  readonly entries: readonly EntryRecord[];
  readonly agent: JsonObject | undefined;
  readonly usage: JsonObject | undefined;
}

const SIDECARS = ["", "-wal", "-shm"];
const BATCH = 500;

async function move(from: string, to: string): Promise<void> {
  for (const suffix of SIDECARS) {
    await rm(to + suffix, {force: true});
    if (existsSync(from + suffix)) await rename(from + suffix, to + suffix);
  }
}

async function remove(path: string): Promise<void> {
  for (const suffix of SIDECARS) await rm(path + suffix, {force: true});
}

async function readDoc(
  storage: Storage,
  kind: string,
  scope: {readonly kind: "session"} | {readonly kind: "conversation"; readonly conversationId: ConversationId},
  context: Context
) {
  const record = await storage.findDocument({kind, scope}, "current", context);
  return record === undefined ? undefined : storage.document(record.id, "current", context);
}

async function readConversation(storage: Storage, conversationId: ConversationId, context: Context): Promise<OldConversation> {
  const entries: EntryRecord[] = [];
  let cursor;
  do {
    const page = await storage.scanEntries({conversationId, order: "ascending"}, 512, cursor, context);
    entries.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  const scope = {kind: "conversation", conversationId} as const;
  return {
    entries,
    agent: (await readDoc(storage, AgentDoc.definition.kind, scope, context))?.value,
    usage: (await readDoc(storage, UsageDoc.definition.kind, scope, context))?.value,
  };
}

async function readOldFile(path: string, context: Context): Promise<{readonly state: OldState; readonly branch: OldConversation} | undefined> {
  const storage = await openNodeSqliteStorage(path);
  try {
    const stored = await readDoc(storage, SessionStateDoc.definition.kind, {kind: "session"}, context);
    if (!stored || stored.version >= SessionStateDoc.definition.version) return undefined;
    const state = stored.value as OldState;
    return {state, branch: await readConversation(storage, state.branch ?? (ROOT_CONVERSATION_ID as ConversationId), context)};
  } finally {
    await storage.close(context);
  }
}

function draftOf(entry: EntryRecord, ids: ReadonlyMap<number, number>, turn: UserEntryData | undefined): EntryDraft {
  const mapped = (id: number): EntryId => {
    const next = ids.get(id);
    if (next === undefined) throw new Error(`Entry ${entry.id} refers to entry ${id}, which is not in its history.`);
    return next as EntryId;
  };
  return {
    kind: turn ? USER_ENTRY_KIND : entry.kind,
    ...(entry.model ? {model: entry.model} : {}),
    ...(turn ? {data: JSON.parse(JSON.stringify(turn)) as never} : entry.data === undefined ? {} : {data: entry.data}),
    ...(entry.head === undefined ? {} : {head: entry.head === entry.id ? "self" : mapped(entry.head)}),
    ...(entry.edits === undefined ? {} : {edits: entry.edits.map((edit) => ({...edit, target: mapped(edit.target)}))}),
  } as EntryDraft;
}

async function writeNewFile(path: string, old: NonNullable<Awaited<ReturnType<typeof readOldFile>>>, context: Context): Promise<void> {
  const {state, branch} = old;
  const turns = state.turns ?? {};
  const harness = await Harness.open(await openNodeSqliteStorage(path), {models: createModels(), registry: createRegistry()}, context);
  try {
    const root = await harness.root(context);
    // Before the entries: a fork takes the agent as of its fork point.
    if (branch.agent) await root.commit(async (tx) => void Object.assign(await tx.doc(AgentDoc, root.id), branch.agent), context);
    const ids = new Map<number, number>();
    const checkpoints: Record<string, TurnCheckpoints> = {};
    let turnIndex = 0;
    for (let start = 0; start < branch.entries.length; start += BATCH) {
      await root.commit(async (tx) => {
        for (const entry of branch.entries.slice(start, start + BATCH)) {
          const record = entry.kind === "pi.user" ? turns[String(entry.id)] : undefined;
          const turn = record && {contentParts: record.contentParts, turnIndex: turnIndex++};
          const copied = await tx.appendEntry(root.id, draftOf(entry, ids, turn));
          ids.set(entry.id, copied.id);
          if (record) checkpoints[String(copied.id)] = {capture: record.capture, before: record.before, ...(record.after ? {after: record.after} : {})};
        }
      }, context);
    }

    const point = state.leaf === undefined || state.leaf === null ? state.leaf : ids.get(state.leaf);
    if (point === undefined && state.leaf !== undefined) throw new Error(`The undo point ${state.leaf} is not on the session's branch.`);
    const fork =
      point === undefined
        ? undefined
        : point === null
          ? await harness.createConversation({ownership: {kind: "ownerless"}}, context)
          : await root.fork(point as EntryId, {ownership: {kind: "ownerless"}}, context);

    await harness.commit(async (tx) => {
      if (branch.usage) Object.assign(await tx.doc(UsageDoc, root.id), branch.usage);
      // An empty conversation has no fork point to take the agent from.
      if (fork && point === null && branch.agent) Object.assign(await tx.doc(AgentDoc, fork.id), branch.agent);

      const next = (await tx.doc(SessionStateDoc)) as unknown as SessionState;
      next.checkpoints = checkpoints;
      if (state.current) next.workspaceCheckpoint = state.current;
      if (fork) {
        next.conversation = fork.id;
        next.redoConversation = root.id;
        next.forks = {[String(point)]: fork.id};
      }
    }, context);
  } finally {
    await harness.close(context);
  }
}

/**
 * Durable cannot edit entries, so a version 1 file's branch is copied into a new one, the old kept as `.pre-migration.sqlite`.
 * Not copied: finished tasks, submissions, abandoned forks and the agent's history.
 */
export async function migrateToTurnEntries(path: string, context: Context): Promise<void> {
  const backup = path.replace(/\.sqlite$/, ".pre-migration.sqlite");
  const migrated = path.replace(/\.sqlite$/, ".migrating.sqlite");
  // A crash between the two moves left only the backup.
  if (!existsSync(path) && existsSync(backup)) await move(backup, path);
  if (!existsSync(path)) return;

  const old = await readOldFile(path, context);
  if (!old) return;

  await remove(migrated);
  try {
    await writeNewFile(migrated, old, context);
  } catch (error) {
    await remove(migrated);
    throw error;
  }
  await move(path, backup);
  await move(migrated, path);
}
