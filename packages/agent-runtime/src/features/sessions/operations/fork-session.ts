import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {ForkSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {ForkSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {ListedSession} from "@supernova/contracts/services/sessions/services";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {releaseSession} from "@supernova/agent-runtime/features/sessions/operations/release-session";

export async function forkSession(input: ForkSessionPayload, runtime: AgentRuntime): Promise<ListedSession> {
  const {sessions, sessionHosts, store} = runtime;
  const source = store.find(input.sessionId);
  if (!source || source.archivedAt !== undefined) throw new ForkSessionError({message: "Session not found."});

  try {
    const seed = await sessionHosts.withChat(input.sessionId, (chat) => chat.forkSeed({turnId: input.turnId}, BACKGROUND_CONTEXT));

    const id = crypto.randomUUID();
    store.create({
      id,
      projectPath: source.projectPath,
      ...(source.worktree ? {worktree: source.worktree} : {}),
      forkedFrom: source.id,
      ...(source.title ? {title: source.title} : {}),
    });

    try {
      await sessionHosts.withChat(id, (chat) => chat.seed(seed, BACKGROUND_CONTEXT));
    } catch (error) {
      await releaseSession({sessionId: id, projectRoot: source.worktree?.path ?? source.projectPath}, runtime).catch(() => undefined);
      await sessions.delete({sessionId: id});
      throw error;
    }

    return (await sessions.record({sessionId: id}))!;
  } catch (cause) {
    throw new ForkSessionError({cause, message: errorMessage(cause, "Failed to fork session.")});
  }
}
