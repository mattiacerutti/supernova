import type {ProjectSessionPinPayload} from "@supernova/contracts/services/projects/procedures";
import type {CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {CreateSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

/** All-or-nothing: a failed step undoes everything before it. */
export async function createSession(runtime: AgentRuntime, payload: CreateSessionPayload): Promise<Session> {
  const {sessionRuntime, sessions, worktrees} = runtime;
  const {id, message, projectPath, workspace: selection} = payload;
  const undos: Array<() => Promise<void>> = [];
  try {
    let worktree;
    if (selection?.mode === "worktree") {
      sessionRuntime.setSetupStep({projectPath, sessionId: id, step: "worktree"});
      try {
        worktree = await worktrees.create({baseRef: selection.baseRef, projectPath});
      } finally {
        sessionRuntime.setSetupStep({projectPath, sessionId: id, step: null});
      }
      const created = worktree;
      undos.push(() => worktrees.remove({projectPath, worktree: created}));
    }
    const session = await sessions.create({id, projectPath, worktree});
    undos.push(() => sessions.delete({sessionId: session.id}));
    if (!message) return session;
    try {
      await sessionRuntime.sendMessage({...message, sessionId: session.id});
    } catch (cause) {
      await sessionRuntime.release({sessionId: session.id, workspacePath: worktree?.path ?? projectPath});
      throw new CreateSessionError({cause, message: errorMessage(cause, "Failed to start the session.")});
    }
    return sessionRuntime.current(session.id);
  } catch (cause) {
    // Undo failures are swallowed so the cause surfaces.
    while (undos.length > 0) await undos.pop()!().catch(() => undefined);
    throw cause;
  }
}

export async function pinSession(runtime: AgentRuntime, input: ProjectSessionPinPayload): Promise<null> {
  await runtime.projects.pinSession(input);
  await runtime.sessionRuntime.refresh(input.sessionId);
  return null;
}

/** Shells first, so a removed worktree is not still someone's cwd. */
export async function archiveSession(runtime: AgentRuntime, input: {readonly projectPath: string; readonly removeWorktree?: boolean; readonly sessionId: string}) {
  const {projects, sessionRuntime, sessions, workspace, worktrees} = runtime;
  const worktree = await sessions.getWorktree(input);
  await workspace.closeSessionTerminals(input.sessionId);
  await sessionRuntime.release({sessionId: input.sessionId, workspacePath: worktree?.path ?? input.projectPath});
  const result = await projects.archiveSession(input);
  if (worktree && input.removeWorktree) await worktrees.remove({projectPath: input.projectPath, worktree});
  return result;
}
