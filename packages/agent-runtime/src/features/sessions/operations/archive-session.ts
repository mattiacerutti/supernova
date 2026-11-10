import type {Ctx} from "@earendil-works/chord";
import type {ArchiveSessionPayload, ArchiveSessionResult} from "@supernova/contracts/services/sessions/procedures";
import type {OperationDeps} from "@supernova/agent-runtime/features/sessions/operations/deps";
import {releaseSession} from "@supernova/agent-runtime/features/sessions/operations/release-session";
import {TerminalsStore} from "@supernova/agent-runtime/features/workspace/contract";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/contract";

export async function archiveSession(input: ArchiveSessionPayload, deps: OperationDeps, ctx: Ctx): Promise<ArchiveSessionResult> {
  const worktree = deps.sessions().find(input.sessionId)?.worktree;

  // First, so no new host starts, not even for a chat reference that retries.
  const result = await deps.sessions().archive(input);

  // Shells must close before their cwd can be removed.
  await (await ctx.get(TerminalsStore, {})).closeSession({sessionId: input.sessionId}, ctx);
  await releaseSession({sessionId: input.sessionId, projectRoot: worktree?.path ?? input.projectPath}, deps);

  if (worktree && input.removeWorktree) {
    await (await ctx.get(Worktrees, {})).remove({projectPath: input.projectPath, worktree}, ctx);
  }

  return result;
}
