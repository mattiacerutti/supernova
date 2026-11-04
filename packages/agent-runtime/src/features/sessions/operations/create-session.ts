import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import type {CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {CreateSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {Session, SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";

export async function createSession(payload: CreateSessionPayload, runtime: AgentRuntime): Promise<Session> {
  const {sessions, worktrees, status, host, sessionHosts, store, checkpointStore} = runtime;
  const {id, message, projectPath, workspace: selection} = payload;
  const undos: Array<() => Promise<void>> = [];

  try {
    let worktree: SessionWorktree | undefined;

    if (selection?.mode === "worktree") {
      status.change(id, {kind: "setup", step: "worktree"});

      try {
        worktree = await worktrees.create({baseRef: selection.baseRef, projectPath});
      } finally {
        status.change(id, {kind: "setup", step: null});
      }

      const created = worktree;
      undos.push(() => worktrees.remove({projectPath, worktree: created}));
    }

    await sessions.create({id, projectPath, worktree});
    undos.push(() => sessions.delete({sessionId: id}));

    try {
      // Accepted creation belongs to the server, not the browser's call context.
      const chat = await host.get(ChatService, {sessionId: id}, BACKGROUND_CONTEXT);

      try {
        if (chat.variant !== "server") {
          throw new Error("The session host refused the server's control.");
        }

        if (message) {
          const sent = await chat.sendMessage(message, BACKGROUND_CONTEXT);

          if (!sent.ok) {
            throw new CreateSessionError({cause: sent.error, message: sent.error.message});
          }
        }

        const current = await chat.current(BACKGROUND_CONTEXT);

        if (!current.ok) {
          throw new CreateSessionError({cause: current.error, message: current.error.message});
        }

        return current.value;
      } finally {
        chat.release();
      }
    } catch (cause) {
      await sessionHosts.release(id, {abort: true});
      await store.release(id);
      await checkpointStore.deleteSession({projectRoot: worktree?.path ?? projectPath, sessionId: id});

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
