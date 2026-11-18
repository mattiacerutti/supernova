import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readdir, readFile, rename, rm} from "node:fs/promises";
import {join} from "node:path";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ModelThinkingLevel} from "@earendil-works/pi-ai";
import {createModels} from "@earendil-works/pi-ai/models";
import type {ConversationId, EntryId} from "@earendil-works/pi-durable";
import {configure, createRegistry, Harness, ROOT_CONVERSATION_ID} from "@earendil-works/pi-durable";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import type {SessionCatalog} from "@supernova/agent-runtime/features/sessions/natives/session-catalog";
import type {SessionState, TurnCheckpoints} from "@supernova/agent-runtime/core/session-state";
import type {UserEntryData} from "@supernova/contracts/services/chat/schemas";
import {USER_ENTRY_KIND} from "@supernova/contracts/services/chat/schemas";
import {SessionStateDoc} from "@supernova/agent-runtime/core/session-state";
import type {LegacySession} from "@supernova/agent-runtime/features/sessions/lib/legacy/legacy-session-file";
import {readLegacySession} from "@supernova/agent-runtime/features/sessions/lib/legacy/legacy-session-file";

const context = BACKGROUND_CONTEXT;

export const LEGACY_DIR = "legacy";

function isLegacyProjectDir(name: string): boolean {
  return name.startsWith("--") && name.endsWith("--");
}

function uncapturedCheckpoints(sessionId: string): TurnCheckpoints {
  const boundary = () => ({checkpointId: randomUUID(), sessionId, status: "disabled" as const});
  return {capture: false, before: boundary(), after: boundary()};
}

async function writeSessionFile(path: string, session: LegacySession): Promise<void> {
  // Writing entries calls no model; the Harness still wraps the registry it is given.
  const harness = await Harness.open(await openNodeSqliteStorage(path), {models: createModels(), registry: createRegistry()}, context);
  try {
    await harness.root(context, {agent: {cwd: session.cwd}});
    await harness.commit(async (tx) => {
      const root = ROOT_CONVERSATION_ID as ConversationId;
      const firstAt = new Map<number, EntryId>();
      const checkpoints: Record<string, TurnCheckpoints> = {};
      let turnIndex = 0;
      for (const item of session.items) {
        const firstKept = item.headIndex === undefined ? undefined : [...firstAt].find(([index]) => index >= item.headIndex!)?.[1];
        const head = item.draft.kind === "pi.compaction" ? (firstKept ?? "self") : undefined;
        const data: UserEntryData | undefined = item.contentParts && {contentParts: [...item.contentParts], turnIndex: turnIndex++};
        const draft = data ? {...item.draft, kind: USER_ENTRY_KIND, data: JSON.parse(JSON.stringify(data)) as never} : item.draft;
        const entry = await tx.appendEntry(root, {...draft, ...(head === undefined ? {} : {head})});
        if (!firstAt.has(item.index)) firstAt.set(item.index, entry.id);
        if (data) checkpoints[String(entry.id)] = uncapturedCheckpoints(session.record.id);
      }
      Object.assign(((await tx.doc(SessionStateDoc)) as unknown as SessionState).checkpoints, JSON.parse(JSON.stringify(checkpoints)));
      if (session.model) await configure(tx, root, {model: session.model, thinkingLevel: session.thinkingLevel as ModelThinkingLevel});
    }, context);
  } finally {
    await harness.close(context);
  }
}

/** The record is written last: a file without one is a crashed import. */
async function importSession(input: {readonly root: string; readonly catalog: SessionCatalog; readonly path: string}): Promise<void> {
  const session = readLegacySession(await readFile(input.path, "utf8"));
  if (!session) throw new Error("Not a Pi session file.");
  const {id} = session.record;
  if (input.catalog.find(id)) return;
  const dir = join(input.root, id);
  await rm(dir, {force: true, recursive: true});
  await mkdir(dir, {recursive: true});
  try {
    await writeSessionFile(join(dir, "session.sqlite"), session);
  } catch (error) {
    await rm(dir, {force: true, recursive: true});
    throw error;
  }
  input.catalog.insert(session.record);
}

/** A folder moves only after all its sessions were tried, so a crash resumes. */
export async function importLegacySessions(input: {readonly root: string; readonly catalog: SessionCatalog; readonly report: (message: string) => void}): Promise<void> {
  const {root} = input;
  if (!existsSync(root)) return;
  const projects = (await readdir(root, {withFileTypes: true})).filter(
    // Session ids are client-chosen, so a session's own folder could match the pattern.
    (entry) => entry.isDirectory() && isLegacyProjectDir(entry.name) && !input.catalog.find(entry.name)
  );
  if (projects.length === 0) return;
  await mkdir(join(root, LEGACY_DIR), {recursive: true});

  for (const project of projects) {
    const projectDir = join(root, project.name);
    const files = (await readdir(projectDir, {withFileTypes: true})).filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"));
    for (const file of files) {
      await importSession({root, catalog: input.catalog, path: join(projectDir, file.name)}).catch((error: unknown) =>
        input.report(`Could not import the old session ${join(project.name, file.name)}: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
    const target = join(root, LEGACY_DIR, project.name);
    // An older Supernova may write the folder again after this import.
    await rename(projectDir, existsSync(target) ? `${target}-${randomUUID()}` : target);
  }
}
