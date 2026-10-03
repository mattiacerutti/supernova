import type {Context, JsonValue, RemoteServiceEndpoint, ServiceCall, ServiceProviderUpdate} from "@earendil-works/chord";
import {copyJson, createRemoteServiceEndpoint, RemoteServiceProvider} from "@earendil-works/chord";
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
import {GetConfigurationPayload} from "@supernova/contracts/services/configuration/procedures";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {UpdateExtensionsError} from "@supernova/contracts/services/extensions/procedures";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {FolderCreatePayload, FolderFilesListPayload, FolderSuggestionsListPayload} from "@supernova/contracts/services/folders/procedures";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ProjectSessionArchiveError, ProjectSessionArchivePayload, ProjectSessionsListPayload} from "@supernova/contracts/services/projects/procedures";
import {ProjectsService} from "@supernova/contracts/services/projects/services";
import {
  ProviderLoginCancelPayload,
  ProviderLoginError,
  ProviderLoginInputSubmitPayload,
  ProviderLoginStartPayload,
  ProviderLogoutPayload,
} from "@supernova/contracts/services/providers/procedures";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import type {ErrorOf, ErrorValue, TaggedErrorInstance} from "@supernova/contracts/lib/errors";
import {GenericError} from "@supernova/contracts/lib/errors";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import {
  CheckpointNavigationError,
  CompactSessionPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import {
  CreateSessionError,
  CreateSessionPayload,
  ForkSessionError,
  ForkSessionPayload,
  GetSessionPayload,
  ListComposerSuggestionsPayload,
  ListModelsPayload,
  RenameSessionError,
  RenameSessionPayload,
} from "@supernova/contracts/services/sessions/procedures";
import {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalResizePayload,
  TerminalsListPayload,
  TerminalWritePayload,
  WorkspaceBranchesListPayload,
  WorkspaceChangesGetPayload,
  WorkspaceDiffContentsGetPayload,
  WorkspaceFileReadPayload,
  WorkspaceFilesListPayload,
  WorkspaceRepositoriesListPayload,
} from "@supernova/contracts/services/workspace/procedures";
import {TerminalError, TerminalNotFoundError, WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/services/workspace/schemas";
import {WorkspaceService} from "@supernova/contracts/services/workspace/services";
import type {z} from "zod";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {archiveSession, createSession} from "@supernova/agent-runtime/rpc/session-workflows";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

type Publish = (subscriptionId: string, update: ServiceProviderUpdate, context: Context) => void | Promise<void>;
/**
 * How one service method runs: its payload schema, the feature call, and its contract error value (a class, or an
 * `errorUnion` named next to the payload). Payloads cross a trust boundary, so each is parsed. The method's result
 * type comes from `error`, and the provider must satisfy the contract with it.
 */
interface Operation<P extends z.ZodType, R, E extends ErrorValue> {
  readonly payload: P;
  readonly run: (payload: z.infer<P>, context: Context) => R | Promise<R>;
  readonly error?: E;
}

/**
 * Runs a service call and returns its outcome as a `ServiceResult`. The protocol carries only its own error codes, so
 * a declared contract error travels as data with its tag, and the client branches on it. Anything else (a bug, an
 * unexpected I/O failure, an invalid request) becomes a `GenericError` with the cause's message. Results are copied
 * to strict JSON: features may leave optional fields undefined.
 */
async function run<P extends z.ZodType, R, E extends ErrorValue = never>(operation: Operation<P, R, E>, input: unknown, context: Context): Promise<ServiceResult<R, ErrorOf<E>>> {
  // Clients see only the code and message; the cause (file paths, stack) stays in the server log.
  const fail = (error: TaggedErrorInstance) => {
    console.error(`[runtime] ${error._tag}: ${error.message}`, ...(error.cause === undefined ? [] : [error.cause]));
    return {ok: false, error: {code: error._tag, message: error.message}} as ServiceResult<R, ErrorOf<E>>;
  };
  const parsed = operation.payload.safeParse(input);
  if (!parsed.success) return fail(new GenericError({cause: parsed.error, message: "The request is invalid."}));
  try {
    const value = await operation.run(parsed.data, context);
    return {ok: true, value: (value === undefined ? null : copyJson(value, {omitUndefinedProperties: true})) as R};
  } catch (cause) {
    if (operation.error !== undefined && cause instanceof operation.error) return fail(cause as TaggedErrorInstance);
    return fail(new GenericError({cause, message: errorMessage(cause, "The operation failed.")}));
  }
}

/** A service method for `operation`: the payload, then Chord's `Context`. */
function method<P extends z.ZodType, R, E extends ErrorValue = never>(
  operation: Operation<P, R, E>
): (payload: z.infer<P>, context: Context) => Promise<ServiceResult<R, ErrorOf<E>>> {
  return (payload, context) => run(operation, payload, context);
}

/** A service method without a payload. */
function action<R, E extends ErrorValue = never>(operation: Omit<Operation<z.ZodUndefined, R, E>, "payload">): (context: Context) => Promise<ServiceResult<R, ErrorOf<E>>> {
  return (context) => run({...operation, payload: undefinedPayload}, undefined, context);
}

/** No payload: what a method without arguments receives. */
const undefinedPayload = {safeParse: () => ({success: true, data: undefined})} as unknown as z.ZodUndefined;

/** One connection's endpoint over a provider, released with the connection. */
function attachment(provider: RemoteServiceProvider): RoutedServerServiceAttachment & RoutedSessionAttachment {
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
    },
  };
}

/** Server-wide services for one connection: everything the runtime offers besides the attached session's own. */
function serverServices(runtime: AgentRuntime): RoutedServerServiceHost {
  const {configuration, extensions, folders, projects, providers, sessionRuntime, sessions, workspace} = runtime;

  return {
    attachClient(presentation: RoutedServerPresentation) {
      const provider = new RemoteServiceProvider([ConfigurationService, ExtensionsService, FoldersService, ProjectsService, ProvidersService, SessionsService, WorkspaceService]);
      provider.provide(ConfigurationService, {
        get: method({payload: GetConfigurationPayload, run: (input) => configuration.get(input)}),
      });
      provider.provide(ExtensionsService, {
        update: action({
          run: async () => {
            try {
              await extensions.update();
            } finally {
              // Even a partial failure may have replaced packages on disk, so every session reloads either way.
              await sessionRuntime.reloadExtensions();
            }
            return null;
          },
          error: UpdateExtensionsError,
        }),
      });
      provider.provide(FoldersService, {
        create: method({payload: FolderCreatePayload, run: (input) => folders.create(input)}),
        listSuggestions: method({
          payload: FolderSuggestionsListPayload,
          run: (input) => folders.listSuggestions(input),
        }),
        listFiles: method({payload: FolderFilesListPayload, run: (input) => folders.listFiles(input)}),
      });
      provider.provide(ProjectsService, {
        listSessions: method({
          payload: ProjectSessionsListPayload,
          run: (input) => projects.listSessions(input),
        }),
        archiveSession: method({
          payload: ProjectSessionArchivePayload,
          run: (input) => archiveSession(runtime, input),
          error: ProjectSessionArchiveError,
        }),
      });
      provider.provide(ProvidersService, {
        logins: providers.logins,
        list: action({run: () => providers.list()}),
        logout: method({payload: ProviderLogoutPayload, run: (input) => providers.logout(input)}),
        startLogin: method({
          payload: ProviderLoginStartPayload,
          run: (input) => providers.startLogin(input),
          error: ProviderLoginError,
        }),
        submitLoginInput: method({
          payload: ProviderLoginInputSubmitPayload,
          run: (input) => providers.submitLoginInput(input),
          error: ProviderLoginError,
        }),
        cancelLogin: method({
          payload: ProviderLoginCancelPayload,
          run: (input) => providers.cancelLogin(input),
          error: ProviderLoginError,
        }),
      });
      provider.provide(WorkspaceService, {
        terminals: workspace.terminals,
        openTerminal: method({payload: TerminalOpenPayload, run: (input) => workspace.openTerminal(input), error: TerminalError}),
        writeTerminal: method({payload: TerminalWritePayload, run: (input) => workspace.writeTerminal(input).then(() => null), error: TerminalNotFoundError}),
        resizeTerminal: method({payload: TerminalResizePayload, run: (input) => workspace.resizeTerminal(input).then(() => null), error: TerminalNotFoundError}),
        closeTerminal: method({payload: TerminalClosePayload, run: (input) => workspace.closeTerminal(input).then(() => null)}),
        listTerminals: method({payload: TerminalsListPayload, run: (input) => workspace.listTerminals(input)}),
        listBranches: method({payload: WorkspaceBranchesListPayload, run: (input) => workspace.listBranches(input), error: WorkspaceGitError}),
        getChanges: method({payload: WorkspaceChangesGetPayload, run: (input) => workspace.getChanges(input), error: WorkspaceGitError}),
        getDiffContents: method({payload: WorkspaceDiffContentsGetPayload, run: (input) => workspace.getDiffContents(input), error: WorkspaceFileError}),
        listRepositories: method({payload: WorkspaceRepositoriesListPayload, run: (input) => workspace.listRepositories(input)}),
        listFiles: method({payload: WorkspaceFilesListPayload, run: (input) => workspace.listFiles(input), error: WorkspaceGitError}),
        readFile: method({payload: WorkspaceFileReadPayload, run: (input) => workspace.readFile(input), error: WorkspaceFileError}),
      });
      provider.provide(SessionsService, {
        // Written by session runtime; served here because clients read it before attaching a session.
        directory: sessionRuntime.board.state,
        create: method({payload: CreateSessionPayload, run: (input) => createSession(runtime, input), error: CreateSessionError}),
        fork: method({payload: ForkSessionPayload, run: (input) => sessions.fork(input), error: ForkSessionError}),
        rename: method({payload: RenameSessionPayload, run: (input) => sessions.rename(input), error: RenameSessionError}),
        get: method({payload: GetSessionPayload, run: (input) => sessions.get(input)}),
        listModels: method({payload: ListModelsPayload, run: (input) => sessions.listModels(input)}),
        listComposerSuggestions: method({payload: ListComposerSuggestionsPayload, run: (input) => sessions.listComposerSuggestions(input)}),
        attach: (sessionId: string, context: Context) =>
          run({payload: GetSessionPayload.shape.sessionId, run: (id) => presentation.attachSession(id, context).then(() => null)}, sessionId, context),
        detach: action({run: (_payload, context) => presentation.detachSession(context).then(() => null)}),
      });
      return attachment(provider);
    },
  };
}

/** The session runtime service of one durable session, for each connection attached to it. */
async function sessionHandle(runtime: AgentRuntime, sessionId: string): Promise<RoutedSessionHandle> {
  const {sessionRuntime} = runtime;
  const document = await sessionRuntime.transcript(sessionId);
  // The attachment names the session; payloads carry the rest.
  const send = SendMessagePayload.omit({sessionId: true});
  const compact = CompactSessionPayload.omit({sessionId: true});
  const step = UndoCheckpointPayload.omit({sessionId: true});
  const revert = RevertToMessagePayload.omit({sessionId: true});
  return {
    attachClient() {
      const provider = new RemoteServiceProvider([SessionRuntimeService]);
      provider.provide(SessionRuntimeService, {
        session: document.state,
        sendMessage: method({payload: send, run: (input) => sessionRuntime.sendMessage({...input, sessionId}).then(() => null)}),
        compact: method({payload: compact, run: (input) => sessionRuntime.compact({...input, sessionId}).then(() => null)}),
        abort: action({run: () => sessionRuntime.abort({sessionId}).then(() => null)}),
        undoCheckpoint: method({payload: step, error: CheckpointNavigationError, run: (input) => sessionRuntime.undoCheckpoint({...input, sessionId}).then(() => null)}),
        redoCheckpoint: method({payload: step, error: CheckpointNavigationError, run: (input) => sessionRuntime.redoCheckpoint({...input, sessionId}).then(() => null)}),
        revertToMessage: method({payload: revert, error: CheckpointNavigationError, run: (input) => sessionRuntime.revertToMessage({...input, sessionId}).then(() => null)}),
      });
      return attachment(provider);
    },
    // The worker outlives attachments: closing a handle never stops the session's work.
    close: async () => undefined,
  };
}

/**
 * The runtime's service host for `pi-server`: one service per feature. Every one but session runtime is served per
 * connection; `SessionRuntimeService` is served for the session a connection attached. Only durable sessions attach;
 * a legacy session is read through `SessionsService.get`.
 */
export function runtimeServiceHost(runtime: AgentRuntime): ServerHost {
  return {
    serverServices: serverServices(runtime),
    async resolveSession(sessionId: string): Promise<SessionMetadata> {
      if (!(await runtime.sessions.isDurable({sessionId}))) throw new SessionNotFoundError("Session not found.");
      return {id: sessionId};
    },
    openSession: (metadata) => sessionHandle(runtime, metadata.id),
  };
}
