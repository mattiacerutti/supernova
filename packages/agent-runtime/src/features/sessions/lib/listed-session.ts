import type {ListedSession} from "@supernova/contracts/services/sessions/services";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";

export function toListedSession(record: SessionRecord): ListedSession {
  return {
    id: record.id,
    forked: record.forkedFrom !== undefined,
    title: record.title ?? "Untitled session",
    updatedAt: record.updatedAt,
    ...(record.worktree ? {worktree: record.worktree} : {}),
    pinned: record.pinned,
    projectPath: record.projectPath,
  };
}
