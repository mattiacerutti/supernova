import type {ArchiveSessionPayload, ArchiveSessionResult} from "@supernova/contracts/services/sessions/procedures";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";

export async function archiveSession(input: ArchiveSessionPayload, runtime: AgentRuntime): Promise<ArchiveSessionResult> {
  const {sessions, workspace, worktrees, status, sessionHosts, store, checkpointStore} = runtime;
  const worktree = await sessions.getWorktree(input);

  // Shells must close before their cwd can be removed; work must settle before the catalog forgets it.
  await workspace.closeSessionTerminals(input.sessionId);
  await sessionHosts.release(input.sessionId, {abort: true});
  await store.release(input.sessionId);
  await checkpointStore.deleteSession({projectRoot: worktree?.path ?? input.projectPath, sessionId: input.sessionId});

  const result = await sessions.archive(input);
  status.forget(input.sessionId);

  if (worktree && input.removeWorktree) {
    await worktrees.remove({projectPath: input.projectPath, worktree});
  }

  return result;
}
