import {randomUUID} from "node:crypto";
import {existsSync} from "node:fs";
import {mkdir, readdir, readFile, rename, rm} from "node:fs/promises";
import {join} from "node:path";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {Models, ModelThinkingLevel} from "@earendil-works/pi-ai";
import type {ConversationId, EntryId} from "@earendil-works/pi-durable";
import {configure, createRegistry, Harness, ROOT_CONVERSATION_ID} from "@earendil-works/pi-durable";
import {openNodeSqliteStorage} from "@earendil-works/pi-durable/storage/sqlite/node";
import type {SessionCatalog} from "@supernova/agent-runtime/pi/lib/session/session-catalog";
import type {SessionState, TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {SessionStateDoc} from "@supernova/agent-runtime/pi/lib/session/session-state";
import type {LegacySession} from "@supernova/agent-runtime/pi/lib/session/legacy/legacy-session-file";
import {readLegacySession} from "@supernova/agent-runtime/pi/lib/session/legacy/legacy-session-file";

const context = BACKGROUND_CONTEXT;

export const LEGACY_DIR = "legacy";

function isLegacyProjectDir(name: string): boolean {
  return name.startsWith("--") && name.endsWith("--");
}

function uncapturedTurn(sessionId: string, contentParts: readonly TurnRecord["contentParts"][number][]): TurnRecord {
  const boundary = () => ({checkpointId: randomUUID(), sessionId, status: "disabled" as const});
  return {contentParts: [...contentParts], capture: false, before: boundary(), after: boundary()};
}

async function writeSessionFile(path: string, session: LegacySession): Promise<void> {
  const harness = await Harness.open(await openNodeSqliteStorage(path), {models: {} as Models, registry: createRegistry()}, context);
  try {
    await harness.root(context, {agent: {cwd: session.cwd}});
    await harness.commit(async (tx) => {
      const root = ROOT_CONVERSATION_ID as ConversationId;
      const firstAt = new Map<number, EntryId>();
      const turns: Record<string, TurnRecord> = {};
      for (const item of session.items) {
        const firstKept = item.headIndex === undefined ? undefined : [...firstAt].find(([index]) => index >= item.headIndex!)?.[1];
        const head = item.draft.kind === "pi.compaction" ? (firstKept ?? "self") : undefined;
        const entry = await tx.appendEntry(root, {...item.draft, ...(head === undefined ? {} : {head})});
        if (!firstAt.has(item.index)) firstAt.set(item.index, entry.id);
        if (item.contentParts) turns[String(entry.id)] = uncapturedTurn(session.record.id, item.contentParts);
      }
      Object.assign(((await tx.doc(SessionStateDoc)) as unknown as SessionState).turns, JSON.parse(JSON.stringify(turns)));
      if (session.model) await configure(tx, root, {model: session.model, thinkingLevel: session.thinkingLevel as ModelThinkingLevel});
    }, context);
  } finally {
    await harness.close(context);
  }
}

/** The catalog record is written last, so a session file without one is a crashed import and is written again. */
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

/** A folder moves only after all its sessions were tried, so a crash resumes. Nothing deletes an old file. */
export async function importLegacySessions(input: {readonly root: string; readonly catalog: SessionCatalog; readonly report: (message: string) => void}): Promise<void> {
  const {root} = input;
  if (!existsSync(root)) return;
  const projects = (await readdir(root, {withFileTypes: true})).filter(
    // Session ids are client-chosen, so a session's own folder could match the pattern; the catalog tells them apart.
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
    // An old Supernova run after this import can write the folder again; its later import moves it beside the first.
    await rename(projectDir, existsSync(target) ? `${target}-${randomUUID()}` : target);
  }
}
