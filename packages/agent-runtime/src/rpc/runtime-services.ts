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
import {GetConfigurationError, GetConfigurationPayload} from "@supernova/contracts/configuration/procedures";
import {ConfigurationService} from "@supernova/contracts/configuration/services";
import {UpdateExtensionsError} from "@supernova/contracts/extensions/procedures";
import {ExtensionsService} from "@supernova/contracts/extensions/services";
import {
  FolderCreateError,
  FolderCreatePayload,
  FolderFilesListError,
  FolderFilesListPayload,
  FolderSuggestionsListError,
  FolderSuggestionsListPayload,
} from "@supernova/contracts/folders/procedures";
import {FoldersService} from "@supernova/contracts/folders/services";
import {ProjectSessionArchiveError, ProjectSessionArchivePayload, ProjectSessionsListError, ProjectSessionsListPayload} from "@supernova/contracts/projects/procedures";
import {ProjectsService} from "@supernova/contracts/projects/services";
import {
  ProviderLoginCancelPayload,
  ProviderLoginError,
  ProviderLoginInputSubmitPayload,
  ProviderLoginStartPayload,
  ProviderLogoutError,
  ProviderLogoutPayload,
  ProvidersListError,
} from "@supernova/contracts/providers/procedures";
import {ProvidersService} from "@supernova/contracts/providers/services";
import type {ServiceResult} from "@supernova/contracts/runtime/services";
import {
  CheckpointConflictError,
  CheckpointGenericError,
  CheckpointInheritedError,
  CheckpointUncapturedError,
  CompactSessionPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionCommandError,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
import {
  CreateSessionError,
  CreateSessionPayload,
  ForkSessionError,
  ForkSessionPayload,
  GetSessionPayload,
  ListComposerSuggestionsError,
  ListComposerSuggestionsPayload,
  ListModelsError,
  ListModelsPayload,
  LoadSessionError,
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
import {
  WorkspaceBinaryFileError,
  WorkspaceFileNotFoundError,
  WorkspaceFileTooLargeError,
  WorkspaceGenericError,
  WorkspaceNotARepositoryError,
} from "@supernova/contracts/workspace/schemas";
import {WorkspaceService} from "@supernova/contracts/workspace/services";
import type {z} from "zod";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {archiveSession, createSession} from "@supernova/agent-runtime/rpc/session-workflows";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

type Publish = (subscriptionId: string, update: ServiceProviderUpdate, context: Context) => void | Promise<void>;
type TaggedError = Error & {readonly _tag: string};
type ErrorClass = new (fields: {readonly message: string; readonly cause?: unknown}) => TaggedError;

const CHECKPOINT_ERRORS = [CheckpointConflictError, CheckpointGenericError, CheckpointInheritedError, CheckpointUncapturedError] as const;
const WORKSPACE_GIT_ERRORS = [WorkspaceGenericError, WorkspaceNotARepositoryError] as const;
const WORKSPACE_FILE_ERRORS = [...WORKSPACE_GIT_ERRORS, WorkspaceFileNotFoundError, WorkspaceBinaryFileError, WorkspaceFileTooLargeError] as const;
const TERMINAL_ERRORS = [TerminalError, TerminalNotFoundError] as const;

/**
 * How one service method runs: its payload schema, the feature call, the contract errors it declares, and the error
 * every other failure becomes (`declared[0]` unless named). Payloads cross a trust boundary, so each is parsed.
 */
interface Operation<P extends z.ZodType, R> {
  readonly payload: P;
  readonly run: (payload: z.infer<P>) => R | Promise<R>;
  readonly declared: readonly ErrorClass[];
  readonly fallback: string;
}

/**
 * Runs a service call and returns its outcome as a `ServiceResult`. The protocol carries only its own error codes, so
 * a declared contract error travels as data with its tag, and the client branches on it. Anything undeclared (a bug,
 * an unexpected I/O failure) becomes the first declared error with `fallback` as its message. Results are copied to
 * strict JSON: features may leave optional fields undefined.
 */
async function run<P extends z.ZodType, R>(operation: Operation<P, R>, input: unknown): Promise<ServiceResult<R>> {
  const {declared, fallback} = operation;
  const fail = (error: TaggedError) => ({ok: false, error: {code: error._tag, message: error.message}}) as const;
  const parsed = operation.payload.safeParse(input);
  if (!parsed.success) return fail(new declared[0]!({message: "The request is invalid."}));
  try {
    const value = await operation.run(parsed.data);
    return {ok: true, value: (value === undefined ? null : copyJson(value, {omitUndefinedProperties: true})) as R};
  } catch (cause) {
    if (declared.some((errorClass) => cause instanceof errorClass)) return fail(cause as TaggedError);
    return fail(new declared[0]!({cause, message: errorMessage(cause, fallback)}));
  }
}

/** A service method for `operation`, taking the payload; Chord's trailing `Context` is not needed. */
function method<P extends z.ZodType, R>(operation: Operation<P, R>): (payload: z.infer<P>, context: Context) => Promise<ServiceResult<R>> {
  return (payload) => run(operation, payload);
}

/** A service method without a payload. */
function action<R>(operation: Omit<Operation<z.ZodUndefined, R>, "payload">): (context: Context) => Promise<ServiceResult<R>> {
  return () => run({...operation, payload: undefinedPayload}, undefined);
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
        get: method({payload: GetConfigurationPayload, run: (input) => configuration.get(input), declared: [GetConfigurationError], fallback: "Unable to load configuration."}),
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
          declared: [UpdateExtensionsError],
          fallback: "Failed to update extensions.",
        }),
      });
      provider.provide(FoldersService, {
        create: method({payload: FolderCreatePayload, run: (input) => folders.create(input), declared: [FolderCreateError], fallback: "Failed to create folder."}),
        listSuggestions: method({
          payload: FolderSuggestionsListPayload,
          run: (input) => folders.listSuggestions(input),
          declared: [FolderSuggestionsListError],
          fallback: "Failed to list folder suggestions.",
        }),
        listFiles: method({payload: FolderFilesListPayload, run: (input) => folders.listFiles(input), declared: [FolderFilesListError], fallback: "Failed to list folder files."}),
      });
      provider.provide(ProjectsService, {
        listSessions: method({
          payload: ProjectSessionsListPayload,
          run: (input) => projects.listSessions(input),
          declared: [ProjectSessionsListError],
          fallback: "Failed to list project sessions.",
        }),
        archiveSession: method({
          payload: ProjectSessionArchivePayload,
          run: (input) => archiveSession(runtime, input),
          declared: [ProjectSessionArchiveError],
          fallback: "Failed to archive project session.",
        }),
      });
      provider.provide(ProvidersService, {
        state: providers.logins,
        list: action({run: () => providers.list(), declared: [ProvidersListError], fallback: "Failed to list providers."}),
        logout: method({payload: ProviderLogoutPayload, run: (input) => providers.logout(input), declared: [ProviderLogoutError], fallback: "Failed to disconnect provider."}),
        startLogin: method({
          payload: ProviderLoginStartPayload,
          run: (input) => providers.startLogin(input),
          declared: [ProviderLoginError],
          fallback: "Failed to start provider login.",
        }),
        submitLoginInput: method({
          payload: ProviderLoginInputSubmitPayload,
          run: (input) => providers.submitLoginInput(input),
          declared: [ProviderLoginError],
          fallback: "Failed to submit provider login input.",
        }),
        cancelLogin: method({
          payload: ProviderLoginCancelPayload,
          run: (input) => providers.cancelLogin(input),
          declared: [ProviderLoginError],
          fallback: "Failed to cancel provider login.",
        }),
      });
      provider.provide(WorkspaceService, {
        listRepositories: method({
          payload: WorkspaceRepositoriesListPayload,
          run: (input) => workspace.listRepositories(input),
          declared: [WorkspaceGenericError],
          fallback: "Workspace operation failed.",
        }),
        listBranches: method({
          payload: WorkspaceBranchesListPayload,
          run: (input) => workspace.listBranches(input),
          declared: WORKSPACE_GIT_ERRORS,
          fallback: "Workspace operation failed.",
        }),
        listFiles: method({
          payload: WorkspaceFilesListPayload,
          run: (input) => workspace.listFiles(input),
          declared: WORKSPACE_GIT_ERRORS,
          fallback: "Workspace operation failed.",
        }),
        getChanges: method({
          payload: WorkspaceChangesGetPayload,
          run: (input) => workspace.getChanges(input),
          declared: WORKSPACE_GIT_ERRORS,
          fallback: "Workspace operation failed.",
        }),
        getDiffContents: method({
          payload: WorkspaceDiffContentsGetPayload,
          run: (input) => workspace.getDiffContents(input),
          declared: WORKSPACE_FILE_ERRORS,
          fallback: "Workspace operation failed.",
        }),
        readFile: method({payload: WorkspaceFileReadPayload, run: (input) => workspace.readFile(input), declared: WORKSPACE_FILE_ERRORS, fallback: "Workspace operation failed."}),
      });
      provider.provide(TerminalsService, {
        state: workspace.terminalsState,
        open: method({payload: TerminalOpenPayload, run: (input) => workspace.openTerminal(input), declared: [TerminalError], fallback: "Terminal operation failed."}),
        write: method({
          payload: TerminalWritePayload,
          run: (input) => workspace.writeTerminal(input).then(() => null),
          declared: TERMINAL_ERRORS,
          fallback: "Terminal operation failed.",
        }),
        resize: method({
          payload: TerminalResizePayload,
          run: (input) => workspace.resizeTerminal(input).then(() => null),
          declared: TERMINAL_ERRORS,
          fallback: "Terminal operation failed.",
        }),
        close: method({
          payload: TerminalClosePayload,
          run: (input) => workspace.closeTerminal(input).then(() => null),
          declared: [TerminalError],
          fallback: "Terminal operation failed.",
        }),
        list: method({payload: TerminalsListPayload, run: (input) => workspace.listTerminals(input), declared: [TerminalError], fallback: "Terminal operation failed."}),
      });
      provider.provide(ComposerService, {
        listModels: method({payload: ListModelsPayload, run: (input) => sessions.listModels(input), declared: [ListModelsError], fallback: "Failed to list session models."}),
        listSuggestions: method({
          payload: ListComposerSuggestionsPayload,
          run: (input) => sessions.listComposerSuggestions(input),
          declared: [ListComposerSuggestionsError],
          fallback: "Failed to list composer suggestions.",
        }),
      });
      provider.provide(SessionDirectory, {state: sessionRuntime.board.state});
      provider.provide(SessionManagement, {
        create: method({payload: CreateSessionPayload, run: (input) => createSession(runtime, input), declared: [CreateSessionError], fallback: "Failed to create session."}),
        fork: method({payload: ForkSessionPayload, run: (input) => sessions.fork(input), declared: [ForkSessionError], fallback: "Failed to fork session."}),
        rename: method({payload: RenameSessionPayload, run: (input) => sessions.rename(input), declared: [RenameSessionError], fallback: "Failed to rename session."}),
        read: method({payload: GetSessionPayload, run: (input) => sessions.get(input), declared: [LoadSessionError], fallback: "Failed to load session."}),
        attach: (sessionId: string, context: Context) =>
          run(
            {
              payload: GetSessionPayload.unwrap().shape.sessionId,
              run: (id) => presentation.attachSession(id, context).then(() => null),
              declared: [LoadSessionError],
              fallback: "Session not found.",
            },
            sessionId
          ),
        detach: (context: Context) => presentation.detachSession(context),
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
  const command = {declared: [SessionCommandError], fallback: "The command failed."} as const;
  const checkpoint = {declared: CHECKPOINT_ERRORS, fallback: "Failed to change the session checkpoint."} as const;
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
        send: method({...command, payload: send, run: (input) => sessionRuntime.sendMessage({...input, sessionId}).then(() => null)}),
        abort: () => sessionRuntime.abort({sessionId}),
        compact: method({...command, payload: compact, run: (input) => sessionRuntime.compact({...input, sessionId}).then(() => null)}),
        undo: method({...checkpoint, payload: step, run: (input) => sessionRuntime.undoCheckpoint({...input, sessionId}).then(() => null)}),
        redo: method({...checkpoint, payload: step, run: (input) => sessionRuntime.redoCheckpoint({...input, sessionId}).then(() => null)}),
        revert: method({...checkpoint, payload: revert, run: (input) => sessionRuntime.revertToMessage({...input, sessionId}).then(() => null)}),
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
