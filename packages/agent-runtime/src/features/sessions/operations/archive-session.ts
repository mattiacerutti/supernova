import type {ArchiveSessionPayload, ArchiveSessionResult} from "@supernova/contracts/services/sessions/procedures";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";

export async function archiveSession(input: ArchiveSessionPayload, runtime: AgentRuntime): Promise<ArchiveSessionResult> {
  const {sessions, workspace, worktrees, status, sessionHosts, store, checkpointStore} = runtime;
  const worktree = await sessions.getWorktree(input);

  // The catalog refuses future starts, including retries from existing chat references.
  const result = await sessions.archive(input);

  // Shells must close before their cwd can be removed, and work must settle before checkpoint cleanup.
  await workspace.closeSessionTerminals(input.sessionId);
  await sessionHosts.release(input.sessionId, {abort: true});
  await store.release(input.sessionId);
  await checkpointStore.deleteSession({projectRoot: worktree?.path ?? input.projectPath, sessionId: input.sessionId});

  status.forget(input.sessionId);

  if (worktree && input.removeWorktree) {
    await worktrees.remove({projectPath: input.projectPath, worktree});
  }

  return result;
}
