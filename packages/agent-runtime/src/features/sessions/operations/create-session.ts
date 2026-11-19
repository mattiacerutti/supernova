import type {Ctx} from "@earendil-works/chord";
import {ChatService} from "@supernova/contracts/services/chat/services";
import type {CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {CreateSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import type {OperationDeps} from "@supernova/agent-runtime/features/sessions/operations/deps";
import {releaseSession} from "@supernova/agent-runtime/features/sessions/operations/release-session";
import {Worktrees} from "@supernova/agent-runtime/features/worktrees/contract";
import {expectVariant} from "@supernova/agent-runtime/lib/chord/principals";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";

export async function createSession(payload: CreateSessionPayload, deps: OperationDeps, ctx: Ctx): Promise<void> {
  const {id, message, projectPath, workspace: selection} = payload;
  const undos: Array<() => Promise<unknown>> = [];

  try {
    let worktree: SessionWorktree | undefined;

    if (selection?.mode === "worktree") {
      const worktrees = await ctx.get(Worktrees, {});
      deps.status().change(id, {kind: "setup", step: "worktree"});

      try {
        worktree = await worktrees.create({baseRef: selection.baseRef, projectPath}, ctx);
      } finally {
        deps.status().change(id, {kind: "setup", step: null});
      }

      const created = worktree;
      undos.push(() => worktrees.remove({projectPath, worktree: created}, ctx));
    }

    await deps.sessions().create({id, projectPath, ...(worktree ? {worktree} : {})});
    undos.push(() => deps.sessions().delete({sessionId: id}));
    undos.push(() => releaseSession({sessionId: id, projectRoot: worktree?.path ?? projectPath}, deps));

    try {
      const chat = expectVariant(await ctx.get(ChatService, {sessionId: id}), "server");
      if (message) await chat.sendMessage(message, ctx);
    } catch (cause) {
      throw new CreateSessionError({cause, message: errorMessage(cause, "Failed to start the session.")});
    }
  } catch (cause) {
    // Undo failures must not hide the creation failure.
    while (undos.length > 0) {
      await undos.pop()!().catch(() => undefined);
    }

    throw cause;
  }
}
