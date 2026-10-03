import type {Context, JsonValue, RemoteServiceEndpoint, ServiceCall, ServiceProviderUpdate} from "@earendil-works/chord";
import {createRemoteServiceEndpoint, RemoteServiceProvider} from "@earendil-works/chord";
import type {
  RoutedServerPresentation,
  RoutedServerServiceAttachment,
  RoutedServerServiceHost,
  RoutedSessionAttachment,
  RoutedSessionHandle,
  ServerHost,
  SessionMetadata,
} from "@earendil-works/pi-server";
import {SessionNotFoundError} from "@earendil-works/pi-server";
import {
  CheckpointConflictError,
  CheckpointGenericError,
  CheckpointInheritedError,
  CheckpointUncapturedError,
  SessionCommandError,
} from "@supernova/contracts/session-runtime/procedures";
import {CreateSessionError, ForkSessionError, LoadSessionError, RenameSessionError} from "@supernova/contracts/sessions/procedures";
import type {ServiceResult} from "@supernova/contracts/sessions/services";
import {SessionController, SessionDirectory, SessionManagement, SessionTranscript} from "@supernova/contracts/sessions/services";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {createSession} from "@supernova/agent-runtime/rpc/session-workflows";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

type Publish = (subscriptionId: string, update: ServiceProviderUpdate, context: Context) => void | Promise<void>;
type TaggedError = Error & {readonly _tag: string};
type ErrorClass = abstract new (...args: never[]) => TaggedError;

/** Errors a session service call declares; anything else becomes `fallback` with the cause's message. */
const CHECKPOINT_ERRORS = [CheckpointConflictError, CheckpointGenericError, CheckpointInheritedError, CheckpointUncapturedError] as const;

/**
 * Runs a service call and returns its outcome as a `ServiceResult`. The protocol carries only its own error codes, so
 * a declared contract error travels as data with its tag, and the client rebuilds the class.
 */
async function result<T>(work: () => Promise<T>, declared: readonly ErrorClass[], fallback: (message: string) => TaggedError): Promise<ServiceResult<T>> {
  try {
    return {ok: true, value: await work()};
  } catch (cause) {
    const error = declared.some((errorClass) => cause instanceof errorClass) ? (cause as TaggedError) : fallback(errorMessage(cause, "The operation failed."));
    return {ok: false, error: {code: error._tag, message: error.message}};
  }
}

/** One connection's endpoint over a provider, released with the connection. */
function attachment(provider: RemoteServiceProvider, onRelease?: () => void): RoutedServerServiceAttachment & RoutedSessionAttachment {
  const endpoint: RemoteServiceEndpoint = createRemoteServiceEndpoint(provider);
  let released = false;
  return {
    invokeService(call: ServiceCall, publish: Publish, context: Context): Promise<JsonValue | undefined> {
      if (released) return Promise.reject(new Error("The service attachment is released."));
      return endpoint.invoke(call, publish, context);
    },
    release() {
      if (released) return;
      released = true;
      endpoint.dispose();
      provider.dispose();
      onRelease?.();
    },
  };
}

/** Server-wide services for one connection: the session directory and lifecycle, and attaching its session services. */
function serverServices(runtime: AgentRuntime): RoutedServerServiceHost {
  const {sessionRuntime, sessions} = runtime;
  return {
    attachClient(presentation: RoutedServerPresentation) {
      const provider = new RemoteServiceProvider([SessionDirectory, SessionManagement]);
      provider.provide(SessionDirectory, {state: sessionRuntime.board.state});
      provider.provide(SessionManagement, {
        create: (payload) =>
          result(
            () => createSession(runtime, payload),
            [CreateSessionError],
            (message) => new CreateSessionError({message})
          ),
        fork: (payload) =>
          result(
            () => sessions.fork(payload),
            [ForkSessionError],
            (message) => new ForkSessionError({message})
          ),
        rename: (payload) =>
          result(
            () => sessions.rename(payload),
            [RenameSessionError],
            (message) => new RenameSessionError({message})
          ),
        read: (payload) =>
          result(
            () => sessions.get(payload),
            [LoadSessionError],
            (message) => new LoadSessionError({message})
          ),
        attach: (sessionId, context) =>
          result(
            () => presentation.attachSession(sessionId, context).then(() => null),
            [LoadSessionError],
            (message) => new LoadSessionError({message})
          ),
        detach: (context) => presentation.detachSession(context),
      });
      return attachment(provider);
    },
  };
}

/**
 * Services of one durable session, for each connection attached to it: the controller and the transcript, whose
 * replicated state is the session's document.
 */
async function sessionHandle(runtime: AgentRuntime, sessionId: string): Promise<RoutedSessionHandle> {
  const {sessionRuntime} = runtime;
  const transcript = await sessionRuntime.transcript(sessionId);
  const checkpoint = (message: string) => new CheckpointGenericError({message});
  const command = (message: string) => new SessionCommandError({message});
  return {
    attachClient() {
      const provider = new RemoteServiceProvider([SessionController, SessionTranscript]);
      provider.provide(SessionTranscript, {state: transcript.state});
      provider.provide(SessionController, {
        send: (payload) => result(() => sessionRuntime.sendMessage({...payload, sessionId}).then(() => null), [], command),
        abort: () => sessionRuntime.abort({sessionId}),
        compact: (payload) => result(() => sessionRuntime.compact({...payload, sessionId}).then(() => null), [], command),
        undo: (payload) => result(() => sessionRuntime.undoCheckpoint({...payload, sessionId}).then(() => null), CHECKPOINT_ERRORS, checkpoint),
        redo: (payload) => result(() => sessionRuntime.redoCheckpoint({...payload, sessionId}).then(() => null), CHECKPOINT_ERRORS, checkpoint),
        revert: (payload) => result(() => sessionRuntime.revertToMessage({...payload, sessionId}).then(() => null), CHECKPOINT_ERRORS, checkpoint),
      });
      return attachment(provider);
    },
    // The worker outlives attachments: closing a handle never stops the session's work.
    close: async () => undefined,
  };
}

/**
 * The session service host for `pi-server`: server-wide services per connection, and per-session services for the
 * session a connection attached. Only durable sessions attach; a legacy session is read through `SessionManagement`.
 */
export function sessionServiceHost(runtime: AgentRuntime): ServerHost {
  return {
    serverServices: serverServices(runtime),
    async resolveSession(sessionId: string): Promise<SessionMetadata> {
      if (!(await runtime.sessions.isDurable({sessionId}))) throw new SessionNotFoundError("Session not found.");
      return {id: sessionId};
    },
    openSession: (metadata) => sessionHandle(runtime, metadata.id),
  };
}
