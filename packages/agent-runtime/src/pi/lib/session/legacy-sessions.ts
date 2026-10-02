import {existsSync} from "node:fs";
import {mkdir, readdir, rename} from "node:fs/promises";
import {basename, dirname, join, resolve} from "node:path";
import type {CompactionEntry, CustomEntry, SessionEntry} from "@earendil-works/pi-coding-agent";
import {getAgentDir, SessionManager} from "@earendil-works/pi-coding-agent";
import type {AssistantMessage, ToolResultMessage, UserMessage as PiUserMessage} from "@earendil-works/pi-ai";
import type {Session, SessionSummary, SessionWorktree, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {buildTurns} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import type {TimelineEntry} from "@supernova/agent-runtime/pi/lib/turns/build-turns";

/**
 * Read-only access to sessions written by the old Pi SDK (`<agentDir>/sessions/<project>/<timestamp>_<id>.jsonl`).
 * The new engine cannot read them and Pi ships no converter. Files are only ever read here; mutating commands on a
 * legacy session reject with `LegacySessionError`.
 *
 * TODO(legacy-convert): converting a legacy session means committing `legacyTimeline()`'s entries (plus the active
 * branch's model messages for context) into a new session file under the same id, then dropping the legacy listing.
 */

/** Custom entry types the old Supernova runtime wrote. */
const CONTENT_PARTS_TYPE = "supernova.user-message-content-parts";
const WORKTREE_TYPE = "supernova.worktree";
const FORK_TYPE = "supernova.fork";

export class LegacySessionError extends Error {
  public constructor() {
    super("This session was created by an older version of Supernova and is read-only.");
  }
}

function legacyRoot(): string {
  return join(getAgentDir(), "sessions");
}

/** The legacy session file for an id: Pi named files `<timestamp>_<id>.jsonl` under one folder per project. */
async function findLegacyPath(sessionId: string): Promise<string | undefined> {
  let projects;
  try {
    projects = await readdir(legacyRoot(), {withFileTypes: true});
  } catch {
    return undefined;
  }
  const suffix = `_${sessionId}.jsonl`;
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const directory = join(legacyRoot(), project.name);
    const match = (await readdir(directory).catch(() => [])).find((name) => name.endsWith(suffix));
    if (match) return join(directory, match);
  }
  return undefined;
}

function workspaceOf(manager: SessionManager): {projectPath: string; worktree: SessionWorktree | undefined} {
  const entry = manager
    .getEntries()
    .find((candidate): candidate is CustomEntry<{projectPath: string; worktree: SessionWorktree}> => candidate.type === "custom" && candidate.customType === WORKTREE_TYPE);
  return entry?.data ? {projectPath: entry.data.projectPath, worktree: entry.data.worktree} : {projectPath: manager.getCwd(), worktree: undefined};
}

/** Maps the old SDK's entries onto the timeline: messages, compactions, and Supernova's authored content parts. */
function toTimeline(entries: readonly SessionEntry[]): TimelineEntry[] {
  return entries.flatMap((entry): TimelineEntry[] => {
    if (entry.type === "custom" && entry.customType === CONTENT_PARTS_TYPE) {
      const contentParts = (entry.data as {contentParts?: UserMessageContentPart[]} | undefined)?.contentParts ?? [];
      return [{type: "content-parts", id: entry.id, timestamp: entry.timestamp, contentParts}];
    }
    if (entry.type === "compaction") return [{type: "compaction", id: entry.id, timestamp: entry.timestamp, summary: (entry as CompactionEntry).summary}];
    if (entry.type !== "message") return [];
    const {message} = entry;
    if (message.role === "user") return [{type: "user", id: entry.id, timestamp: entry.timestamp, message: message as PiUserMessage}];
    if (message.role === "assistant") return [{type: "assistant", id: entry.id, timestamp: entry.timestamp, message: message as AssistantMessage}];
    if (message.role === "toolResult") return [{type: "tool-result", id: entry.id, timestamp: entry.timestamp, message: message as ToolResultMessage}];
    return [];
  });
}

function titleOf(manager: SessionManager, firstMessage: string | undefined): string {
  return manager.getSessionName()?.trim() || firstMessage?.trim() || "Untitled session";
}

/** Whether `sessionId` names a legacy session. */
export async function isLegacySession(sessionId: string): Promise<boolean> {
  return (await findLegacyPath(sessionId)) !== undefined;
}

/** A legacy session as the contract shows it, from its active branch. Undone turns are not shown. */
export async function loadLegacySession(sessionId: string): Promise<Session | undefined> {
  const path = await findLegacyPath(sessionId);
  if (!path) return undefined;
  const manager = SessionManager.open(path);
  const context = manager.buildSessionContext();
  const modelReference = context.model ? {id: context.model.modelId, providerId: context.model.provider, thinkingLevel: context.thinkingLevel} : undefined;
  const turns = modelReference ? buildTurns(toTimeline(manager.getBranch()), modelReference) : [];
  const firstText = turns[0]?.userMessage.contentParts.map((part) => (part.type === "text" ? part.text : "")).join("");
  const {projectPath, worktree} = workspaceOf(manager);
  return {
    id: sessionId,
    context: {contextWindow: 0, usedTokens: null},
    forked: manager.getEntries().some((entry) => entry.type === "custom" && entry.customType === FORK_TYPE) || manager.getHeader()?.parentSession !== undefined,
    ...(modelReference ? {modelReference} : {}),
    projectPath,
    ...(worktree ? {worktree} : {}),
    title: titleOf(manager, firstText),
    turns,
    undoneTurns: [],
    updatedAt: turns.at(-1)?.completedAt ?? manager.getLeafEntry()?.timestamp ?? manager.getHeader()?.timestamp ?? new Date(0).toISOString(),
  };
}

/** Summaries of a project's legacy sessions; reads only Pi's per-project folder. */
export async function listLegacySessions(projectPath: string): Promise<SessionSummary[]> {
  const sessions = await SessionManager.list(projectPath).catch(() => []);
  return sessions.map((session) => ({
    id: session.id,
    forked: session.parentSessionPath !== undefined,
    title: session.name?.trim() || (session.firstMessage.trim() && session.firstMessage !== "(no messages)" ? session.firstMessage.trim() : "Untitled session"),
    updatedAt: session.modified.toISOString(),
    worktree: session.cwd.length > 0 && resolve(session.cwd) !== resolve(projectPath),
  }));
}

/**
 * Archives a legacy session as the old runtime did: its file moves to `archive/` beside it, out of Pi's listing. The
 * file's content is never modified.
 */
export async function archiveLegacySession(projectPath: string, sessionId: string): Promise<"archived" | "exists" | "missing"> {
  const session = (await SessionManager.list(projectPath).catch(() => [])).find((candidate) => candidate.id === sessionId);
  if (!session) return "missing";
  const archiveDir = join(dirname(session.path), "archive");
  const archivePath = join(archiveDir, basename(session.path));
  if (existsSync(archivePath)) return "exists";
  await mkdir(archiveDir, {recursive: true});
  await rename(session.path, archivePath);
  return "archived";
}
