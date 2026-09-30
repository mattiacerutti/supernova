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
