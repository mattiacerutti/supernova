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
import {GenericError} from "@supernova/contracts/runtime/schemas";
import type {ServiceResult} from "@supernova/contracts/runtime/services";
import {
  CheckpointConflictError,
  CheckpointInheritedError,
  CheckpointUncapturedError,
  CompactSessionPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";
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
import {WorkspaceBinaryFileError, WorkspaceFileNotFoundError, WorkspaceFileTooLargeError, WorkspaceNotARepositoryError} from "@supernova/contracts/workspace/schemas";
import {WorkspaceService} from "@supernova/contracts/workspace/services";
import type {z} from "zod";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {archiveSession, createSession} from "@supernova/agent-runtime/rpc/session-workflows";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

type Publish = (subscriptionId: string, update: ServiceProviderUpdate, context: Context) => void | Promise<void>;
type TaggedError = Error & {readonly _tag: string};
type ErrorClass = abstract new (...args: never[]) => TaggedError;

const CHECKPOINT_ERRORS = [CheckpointConflictError, CheckpointInheritedError, CheckpointUncapturedError] as const;
const WORKSPACE_GIT_ERRORS = [WorkspaceNotARepositoryError] as const;
const WORKSPACE_FILE_ERRORS = [...WORKSPACE_GIT_ERRORS, WorkspaceFileNotFoundError, WorkspaceBinaryFileError, WorkspaceFileTooLargeError] as const;

/**
 * How one service method runs: its payload schema, the feature call, and the contract errors it declares. Payloads
 * cross a trust boundary, so each is parsed. `E` is inferred from `declared`, so the method's result type, and with it
 * the contract the provider must satisfy, names exactly these errors.
 */
interface Operation<P extends z.ZodType, R, E extends readonly ErrorClass[]> {
  readonly payload: P;
  readonly run: (payload: z.infer<P>, context: Context) => R | Promise<R>;
  readonly declared?: E;
}

type Declared<E extends readonly ErrorClass[]> = InstanceType<E[number]>;

/**
 * Runs a service call and returns its outcome as a `ServiceResult`. The protocol carries only its own error codes, so
 * a declared contract error travels as data with its tag, and the client branches on it. Anything else (a bug, an
 * unexpected I/O failure, an invalid request) becomes a `GenericError` with the cause's message. Results are copied
 * to strict JSON: features may leave optional fields undefined.
 */
async function run<P extends z.ZodType, R, E extends readonly ErrorClass[]>(
  operation: Operation<P, R, E>,
  input: unknown,
  context: Context
): Promise<ServiceResult<R, Declared<E>>> {
  const declared: readonly ErrorClass[] = operation.declared ?? [];
  // Clients see only the code and message; the cause (file paths, stack) stays in the server log.
  const fail = (error: TaggedError) => {
    console.error(`[runtime] ${error._tag}: ${error.message}`, ...(error.cause === undefined ? [] : [error.cause]));
    return {ok: false, error: {code: error._tag, message: error.message}} as ServiceResult<R, Declared<E>>;
  };
  const parsed = operation.payload.safeParse(input);
  if (!parsed.success) return fail(new GenericError({cause: parsed.error, message: "The request is invalid."}));
  try {
    const value = await operation.run(parsed.data, context);
    return {ok: true, value: (value === undefined ? null : copyJson(value, {omitUndefinedProperties: true})) as R};
  } catch (cause) {
    if (declared.some((errorClass) => cause instanceof errorClass)) return fail(cause as TaggedError);
    return fail(new GenericError({cause, message: errorMessage(cause, "The operation failed.")}));
  }
}

/** A service method for `operation`: the payload, then Chord's `Context`. */
function method<P extends z.ZodType, R, const E extends readonly ErrorClass[] = []>(
  operation: Operation<P, R, E>
): (payload: z.infer<P>, context: Context) => Promise<ServiceResult<R, Declared<E>>> {
  return (payload, context) => run(operation, payload, context);
}

/** A service method without a payload. */
function action<R, const E extends readonly ErrorClass[] = []>(
  operation: Omit<Operation<z.ZodUndefined, R, E>, "payload">
): (context: Context) => Promise<ServiceResult<R, Declared<E>>> {
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
          declared: [UpdateExtensionsError],
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
          declared: [ProjectSessionArchiveError],
        }),
      });
      provider.provide(ProvidersService, {
        state: providers.logins,
        list: action({run: () => providers.list()}),
        logout: method({payload: ProviderLogoutPayload, run: (input) => providers.logout(input)}),
        startLogin: method({
          payload: ProviderLoginStartPayload,
          run: (input) => providers.startLogin(input),
          declared: [ProviderLoginError],
        }),
        submitLoginInput: method({
          payload: ProviderLoginInputSubmitPayload,
          run: (input) => providers.submitLoginInput(input),
          declared: [ProviderLoginError],
        }),
        cancelLogin: method({
          payload: ProviderLoginCancelPayload,
          run: (input) => providers.cancelLogin(input),
          declared: [ProviderLoginError],
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
          declared: WORKSPACE_GIT_ERRORS,
        }),
        listFiles: method({
          payload: WorkspaceFilesListPayload,
          run: (input) => workspace.listFiles(input),
          declared: WORKSPACE_GIT_ERRORS,
        }),
        getChanges: method({
          payload: WorkspaceChangesGetPayload,
          run: (input) => workspace.getChanges(input),
          declared: WORKSPACE_GIT_ERRORS,
        }),
        getDiffContents: method({
          payload: WorkspaceDiffContentsGetPayload,
          run: (input) => workspace.getDiffContents(input),
          declared: WORKSPACE_FILE_ERRORS,
        }),
        readFile: method({payload: WorkspaceFileReadPayload, run: (input) => workspace.readFile(input), declared: WORKSPACE_FILE_ERRORS}),
      });
      provider.provide(TerminalsService, {
        state: workspace.terminalsState,
        open: method({payload: TerminalOpenPayload, run: (input) => workspace.openTerminal(input), declared: [TerminalError]}),
        write: method({payload: TerminalWritePayload, run: (input) => workspace.writeTerminal(input).then(() => null), declared: [TerminalNotFoundError]}),
        resize: method({payload: TerminalResizePayload, run: (input) => workspace.resizeTerminal(input).then(() => null), declared: [TerminalNotFoundError]}),
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
        create: method({payload: CreateSessionPayload, run: (input) => createSession(runtime, input), declared: [CreateSessionError]}),
        fork: method({payload: ForkSessionPayload, run: (input) => sessions.fork(input), declared: [ForkSessionError]}),
        rename: method({payload: RenameSessionPayload, run: (input) => sessions.rename(input), declared: [RenameSessionError]}),
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
  const checkpoint = {declared: CHECKPOINT_ERRORS} as const;
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
