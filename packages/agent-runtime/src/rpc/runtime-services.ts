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
import {GetConfigurationPayload} from "@supernova/contracts/configuration/procedures";
import {ConfigurationService} from "@supernova/contracts/configuration/services";
import {UpdateExtensionsError} from "@supernova/contracts/extensions/procedures";
import {ExtensionsService} from "@supernova/contracts/extensions/services";
import {FolderCreatePayload, FolderFilesListPayload, FolderSuggestionsListPayload} from "@supernova/contracts/folders/procedures";
import {FoldersService} from "@supernova/contracts/folders/services";
import {ProjectSessionArchiveError, ProjectSessionArchivePayload, ProjectSessionsListPayload} from "@supernova/contracts/projects/procedures";
import {ProjectsService} from "@supernova/contracts/projects/services";
import {
  ProviderLoginCancelPayload,
  ProviderLoginError,
  ProviderLoginInputSubmitPayload,
  ProviderLoginStartPayload,
  ProviderLogoutPayload,
} from "@supernova/contracts/providers/procedures";
import {ProvidersService} from "@supernova/contracts/providers/services";
import type {ErrorOf, ErrorValue, TaggedErrorInstance} from "@supernova/contracts/runtime/schemas";
import {GenericError} from "@supernova/contracts/runtime/schemas";
import type {ServiceResult} from "@supernova/contracts/runtime/services";
import {CheckpointNavigationError, CompactSessionPayload, RevertToMessagePayload, SendMessagePayload, UndoCheckpointPayload} from "@supernova/contracts/session-runtime/procedures";
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
} from "@supernova/contracts/sessions/procedures";
import {ComposerService, SessionController, SessionDirectory, SessionManagement, SessionTranscript} from "@supernova/contracts/sessions/services";
import {TerminalClosePayload, TerminalOpenPayload, TerminalResizePayload, TerminalsListPayload, TerminalWritePayload} from "@supernova/contracts/terminals/procedures";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/terminals/schemas";
import {TerminalsService} from "@supernova/contracts/terminals/services";
import {
  WorkspaceBranchesListPayload,
  WorkspaceChangesGetPayload,
  WorkspaceDiffContentsGetPayload,
  WorkspaceFileReadPayload,
  WorkspaceFilesListPayload,
  WorkspaceRepositoriesListPayload,
} from "@supernova/contracts/workspace/procedures";
import {WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/workspace/schemas";
import {WorkspaceService} from "@supernova/contracts/workspace/services";
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
      const provider = new RemoteServiceProvider([
        ComposerService,
        ConfigurationService,
        ExtensionsService,
        FoldersService,
        ProjectsService,
        ProvidersService,
        SessionDirectory,
        SessionManagement,
        TerminalsService,
        WorkspaceService,
      ]);
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
        state: providers.logins,
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
        listRepositories: method({
          payload: WorkspaceRepositoriesListPayload,
          run: (input) => workspace.listRepositories(input),
        }),
        listBranches: method({
          payload: WorkspaceBranchesListPayload,
          run: (input) => workspace.listBranches(input),
          error: WorkspaceGitError,
        }),
        listFiles: method({
          payload: WorkspaceFilesListPayload,
          run: (input) => workspace.listFiles(input),
          error: WorkspaceGitError,
        }),
        getChanges: method({
          payload: WorkspaceChangesGetPayload,
          run: (input) => workspace.getChanges(input),
          error: WorkspaceGitError,
        }),
        getDiffContents: method({
          payload: WorkspaceDiffContentsGetPayload,
          run: (input) => workspace.getDiffContents(input),
          error: WorkspaceFileError,
        }),
        readFile: method({payload: WorkspaceFileReadPayload, run: (input) => workspace.readFile(input), error: WorkspaceFileError}),
      });
      provider.provide(TerminalsService, {
        state: workspace.terminalsState,
        open: method({payload: TerminalOpenPayload, run: (input) => workspace.openTerminal(input), error: TerminalError}),
        write: method({payload: TerminalWritePayload, run: (input) => workspace.writeTerminal(input).then(() => null), error: TerminalNotFoundError}),
        resize: method({payload: TerminalResizePayload, run: (input) => workspace.resizeTerminal(input).then(() => null), error: TerminalNotFoundError}),
        close: method({payload: TerminalClosePayload, run: (input) => workspace.closeTerminal(input).then(() => null)}),
        list: method({payload: TerminalsListPayload, run: (input) => workspace.listTerminals(input)}),
      });
      provider.provide(ComposerService, {
        listModels: method({payload: ListModelsPayload, run: (input) => sessions.listModels(input)}),
        listSuggestions: method({
          payload: ListComposerSuggestionsPayload,
          run: (input) => sessions.listComposerSuggestions(input),
        }),
      });
      provider.provide(SessionDirectory, {state: sessionRuntime.board.state});
      provider.provide(SessionManagement, {
        create: method({payload: CreateSessionPayload, run: (input) => createSession(runtime, input), error: CreateSessionError}),
        fork: method({payload: ForkSessionPayload, run: (input) => sessions.fork(input), error: ForkSessionError}),
        rename: method({payload: RenameSessionPayload, run: (input) => sessions.rename(input), error: RenameSessionError}),
        read: method({payload: GetSessionPayload, run: (input) => sessions.get(input)}),
        attach: (sessionId: string, context: Context) =>
          run({payload: GetSessionPayload.unwrap().shape.sessionId, run: (id) => presentation.attachSession(id, context).then(() => null)}, sessionId, context),
        detach: action({run: (_payload, context) => presentation.detachSession(context).then(() => null)}),
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
  // The attachment names the session; payloads carry the rest.
  const send = SendMessagePayload.unwrap().omit({sessionId: true});
  const compact = CompactSessionPayload.unwrap().omit({sessionId: true});
  const step = UndoCheckpointPayload.unwrap().omit({sessionId: true});
  const revert = RevertToMessagePayload.unwrap().omit({sessionId: true});
  return {
    attachClient() {
      const provider = new RemoteServiceProvider([SessionController, SessionTranscript]);
      provider.provide(SessionTranscript, {state: transcript.state});
      provider.provide(SessionController, {
        send: method({payload: send, run: (input) => sessionRuntime.sendMessage({...input, sessionId}).then(() => null)}),
        abort: action({run: () => sessionRuntime.abort({sessionId}).then(() => null)}),
        compact: method({payload: compact, run: (input) => sessionRuntime.compact({...input, sessionId}).then(() => null)}),
        undo: method({payload: step, error: CheckpointNavigationError, run: (input) => sessionRuntime.undoCheckpoint({...input, sessionId}).then(() => null)}),
        redo: method({payload: step, error: CheckpointNavigationError, run: (input) => sessionRuntime.redoCheckpoint({...input, sessionId}).then(() => null)}),
        revert: method({payload: revert, error: CheckpointNavigationError, run: (input) => sessionRuntime.revertToMessage({...input, sessionId}).then(() => null)}),
      });
      return attachment(provider);
    },
    // The worker outlives attachments: closing a handle never stops the session's work.
    close: async () => undefined,
  };
}

/**
 * The runtime's service host for `pi-server`: every server-wide service per connection, and per-session services for
 * the session a connection attached. Only durable sessions attach; a legacy session is read through `SessionManagement`.
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
