import type {Ctx, Host} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {RuntimePrincipal, ServiceResult} from "@supernova/contracts/lib/protocol";
import type {ChatServer} from "@supernova/contracts/services/session-runtime/services";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import type {ArchiveSessionPayload, ArchiveSessionResult, CreateSessionPayload} from "@supernova/contracts/services/sessions/procedures";
import {CreateSessionError} from "@supernova/contracts/services/sessions/procedures";
import type {Session, SessionWorktree} from "@supernova/contracts/services/sessions/schemas";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import type {SessionWorkflows} from "@supernova/agent-runtime/features/sessions/facet";
import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";
import type {SessionHosts} from "@supernova/agent-runtime/composition/session-hosts";

interface SessionOperations {
  readonly runtime: AgentRuntime;
  readonly server: Host<RuntimePrincipal>;
  readonly hosts: SessionHosts;
}

/** All-or-nothing: a failed step undoes everything before it. */
async function createSession(operations: SessionOperations, payload: CreateSessionPayload, ctx: Ctx<RuntimePrincipal>): Promise<Session> {
  const {runtime} = operations;
  const {status} = runtime;
  const {sessions, worktrees} = runtime;
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
    return await withControl(operations, id, async (control) => {
      if (message) {
        try {
          await unwrap(control.sendMessage(message, ctx));
        } catch (cause) {
          await releaseSession(operations, {sessionId: id, workspacePath: worktree?.path ?? projectPath});
          throw new CreateSessionError({cause, message: errorMessage(cause, "Failed to start the session.")});
        }
      }
      return unwrap(control.current(ctx));
    });
  } catch (cause) {
    // Undo failures are swallowed so the cause surfaces.
    while (undos.length > 0) await undos.pop()!().catch(() => undefined);
    throw cause;
  }
}

/** Shells first, so a removed worktree is not still someone's cwd; work settles before the catalog forgets it. */
async function archiveSession(operations: SessionOperations, input: ArchiveSessionPayload): Promise<ArchiveSessionResult> {
  const {sessions, workspace, worktrees} = operations.runtime;
  const worktree = await sessions.getWorktree(input);
  await workspace.closeSessionTerminals(input.sessionId);
  await releaseSession(operations, {sessionId: input.sessionId, workspacePath: worktree?.path ?? input.projectPath});
  const result = await sessions.archive(input);
  operations.runtime.status.forget(input.sessionId);
  if (worktree && input.removeWorktree) await worktrees.remove({projectPath: input.projectPath, worktree});
  return result;
}

/** Only before a destructive step, never because a client left. */
async function releaseSession(operations: SessionOperations, input: {readonly sessionId: string; readonly workspacePath: string}): Promise<void> {
  const {hosts, runtime} = operations;
  await hosts.release(input.sessionId, {abort: true});
  await runtime.store.release(input.sessionId);
  await runtime.checkpointStore.deleteSession({projectRoot: input.workspacePath, sessionId: input.sessionId});
}

async function unwrap<T>(pending: Promise<ServiceResult<T, never>>): Promise<T> {
  const result = await pending;
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

/** As the server, whoever asked: the server variant binds only for the server principal. */
async function withControl<T>(operations: SessionOperations, sessionId: string, work: (control: ChatServer) => Promise<T>): Promise<T> {
  const control = await operations.server.get(ChatService, {sessionId}, BACKGROUND_CONTEXT);
  try {
    if (control.variant !== "server") throw new Error("The session host refused the server's control.");
    return await work(control);
  } finally {
    control.release();
  }
}

export function sessionWorkflows(operations: SessionOperations): SessionWorkflows {
  return {
    create: (input, ctx) => createSession(operations, input, ctx),
    archive: (input) => archiveSession(operations, input),
  };
}
