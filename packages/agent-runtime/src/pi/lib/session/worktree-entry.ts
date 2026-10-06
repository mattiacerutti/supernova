import {createReadStream} from "node:fs";
import {createInterface} from "node:readline";
import type {CustomEntry, SessionEntry} from "@earendil-works/pi-coding-agent";
import type {SessionWorktree} from "@supernova/contracts/sessions/schemas";
import type {PiSessionManager} from "@supernova/agent-runtime/pi/sdk";

export const WORKTREE_CUSTOM_TYPE = "supernova.worktree";

interface WorktreeEntryData {
  /** The project the session is listed under; Pi's `cwd` is the worktree itself. */
  readonly projectPath: string;
  readonly worktree: SessionWorktree;
}

function isWorktreeEntry(entry: SessionEntry): entry is CustomEntry<WorktreeEntryData> & {readonly data: WorktreeEntryData} {
  return entry.type === "custom" && entry.customType === WORKTREE_CUSTOM_TYPE;
}

/** Where a session runs: its project, plus the worktree when it was started in one. */
export function sessionWorkspace(sessionManager: PiSessionManager): {readonly projectPath: string; readonly worktree: SessionWorktree | undefined} {
  const entry = sessionManager.getEntries().find(isWorktreeEntry);
  return entry ? {projectPath: entry.data.projectPath, worktree: entry.data.worktree} : {projectPath: sessionManager.getCwd(), worktree: undefined};
}

/**
 * Reads a session file's worktree without loading the conversation. The marker is written before any message, so
 * the scan stops at the first message.
 */
export async function readSessionWorktree(sessionPath: string): Promise<SessionWorktree | undefined> {
  const lines = createInterface({crlfDelay: Infinity, input: createReadStream(sessionPath, {encoding: "utf8"})});
  try {
    for await (const line of lines) {
      let entry: SessionEntry;
      try {
        entry = JSON.parse(line) as SessionEntry;
      } catch {
        continue;
      }
      if (isWorktreeEntry(entry)) return entry.data.worktree;
      if (entry.type === "message") return undefined;
    }
    return undefined;
  } catch {
    return undefined;
  } finally {
    lines.close();
  }
}
