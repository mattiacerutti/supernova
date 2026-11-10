import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {CreateSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {releaseSession} from "@supernova/agent-runtime/features/sessions/operations/release-session";

export async function createSession(payload: CreateSessionPayload, runtime: AgentRuntime): Promise<void> {
  const {sessions, worktrees, status, sessionHosts} = runtime;
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
    undos.push(() => releaseSession({sessionId: id, projectRoot: worktree?.path ?? projectPath}, runtime));

    try {
      // As the server, so the creation outlives the browser's call.
      await sessionHosts.withChat(id, async (chat) => {
        if (message) await chat.sendMessage(message, BACKGROUND_CONTEXT);
      });
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
