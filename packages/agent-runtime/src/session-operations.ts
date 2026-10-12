import type {ProjectSessionPinPayload} from "@supernova/contracts/services/projects/procedures";
import type {CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {CreateSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {Workflow} from "@supernova/agent-runtime/lib/workflow";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

/**
 * Creates a session and starts its first turn. Setup is all-or-nothing: when a required step fails, everything before
 * it is undone and the client keeps nothing. Returns the session with its first turn, so a client's document starts
 * where its updates continue.
 */
export async function createSession(runtime: AgentRuntime, payload: CreateSessionPayload): Promise<Session> {
  const {sessionRuntime, sessions, worktrees} = runtime;
  const {id, message, projectPath, workspace: selection} = payload;
  const workflow = new Workflow();
  const worktree =
    selection?.mode === "worktree"
      ? await workflow.step({
          name: "worktree",
          required: true,
          run: async () => {
            sessionRuntime.setSetupStep({projectPath, sessionId: id, step: "worktree"});
            try {
              const value = await worktrees.create({baseRef: selection.baseRef, projectPath});
              return {value, undo: () => worktrees.remove({projectPath, worktree: value})};
            } finally {
              sessionRuntime.setSetupStep({projectPath, sessionId: id, step: null});
            }
          },
        })
      : undefined;
  const session = await workflow.step({
    name: "session",
    required: true,
    run: async () => {
      const value = await sessions.create({id, projectPath, worktree});
      return {value, undo: () => sessions.delete({sessionId: value.id})};
    },
  });
  if (!message) return session;
  try {
    await sessionRuntime.sendMessage({...message, sessionId: session.id});
  } catch (cause) {
    await sessionRuntime.release({sessionId: session.id, workspacePath: worktree?.path ?? projectPath});
    await workflow.rollback();
    throw new CreateSessionError({cause, message: errorMessage(cause, "Failed to start the session.")});
  }
  return sessionRuntime.current(session.id);
}

/** Pins or unpins a session, and publishes it, so every client's listing shows the pin. */
export async function pinSession(runtime: AgentRuntime, input: ProjectSessionPinPayload): Promise<null> {
  await runtime.projects.pinSession(input);
  await runtime.sessionRuntime.refresh(input.sessionId);
  return null;
}

/**
 * Archives a session: its shells go first so a removed worktree is not still someone's cwd, then its work stops and
 * it leaves the listing; its worktree is removed when asked.
 */
export async function archiveSession(runtime: AgentRuntime, input: {readonly projectPath: string; readonly removeWorktree?: boolean; readonly sessionId: string}) {
  const {projects, sessionRuntime, sessions, workspace, worktrees} = runtime;
  const worktree = await sessions.getWorktree(input);
  await workspace.closeSessionTerminals(input.sessionId);
  await sessionRuntime.release({sessionId: input.sessionId, workspacePath: worktree?.path ?? input.projectPath});
  const result = await projects.archiveSession(input);
  if (worktree && input.removeWorktree) await worktrees.remove({projectPath: input.projectPath, worktree});
  return result;
}
