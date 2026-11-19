import type {Ctx} from "@earendil-works/chord";
import {ChatService} from "@supernova/contracts/services/chat/services";
import type {ForkSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {ForkSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {ListedSession} from "@supernova/contracts/services/sessions/services";
import type {OperationDeps} from "@supernova/agent-runtime/features/sessions/operations/deps";
import {releaseSession} from "@supernova/agent-runtime/features/sessions/operations/release-session";
import {expectVariant} from "@supernova/agent-runtime/lib/chord/principals";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";

export async function forkSession(input: ForkSessionPayload, deps: OperationDeps, ctx: Ctx): Promise<ListedSession> {
  const source = deps.sessions().find(input.sessionId);
  if (!source || source.archivedAt !== undefined) throw new ForkSessionError({message: "Session not found."});

  try {
    const seed = await expectVariant(await ctx.get(ChatService, {sessionId: input.sessionId}), "server").forkSeed({turnId: input.turnId}, ctx);

    const id = crypto.randomUUID();
    await deps.sessions().create({
      id,
      projectPath: source.projectPath,
      ...(source.worktree ? {worktree: source.worktree} : {}),
      forkedFrom: source.id,
      ...(source.title ? {title: source.title} : {}),
    });

    try {
      await expectVariant(await ctx.get(ChatService, {sessionId: id}), "server").seed(seed, ctx);
    } catch (error) {
      await releaseSession({sessionId: id, projectRoot: source.worktree?.path ?? source.projectPath}, deps).catch(() => undefined);
      await deps.sessions().delete({sessionId: id});
      throw error;
    }

    return (await deps.sessions().record({sessionId: id}))!;
  } catch (cause) {
    throw new ForkSessionError({cause, message: errorMessage(cause, "Failed to fork session.")});
  }
}
