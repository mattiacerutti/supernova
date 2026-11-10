import type {ArchiveSessionPayload, ArchiveSessionResult} from "@supernova/contracts/services/sessions/procedures";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import {releaseSession} from "@supernova/agent-runtime/features/sessions/operations/release-session";

export async function archiveSession(input: ArchiveSessionPayload, runtime: AgentRuntime): Promise<ArchiveSessionResult> {
  const {sessions, workspace, worktrees} = runtime;
  const worktree = await sessions.getWorktree(input);

  // First, so no new host starts, not even for a chat reference that retries.
  const result = await sessions.archive(input);

  // Shells must close before their cwd can be removed.
  await workspace.closeSessionTerminals(input.sessionId);
  await releaseSession({sessionId: input.sessionId, projectRoot: worktree?.path ?? input.projectPath}, runtime);

  if (worktree && input.removeWorktree) {
    await worktrees.remove({projectPath: input.projectPath, worktree});
  }

  return result;
}
