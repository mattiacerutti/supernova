import type {Host} from "@earendil-works/chord";
import {cell, listener, resource} from "@earendil-works/chord";
import type {ErrorOf, ErrorValue, TaggedErrorInstance} from "@supernova/contracts/lib/errors";
import {GenericError} from "@supernova/contracts/lib/errors";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import {json} from "@supernova/contracts/lib/protocol";
import {GetConfigurationPayload} from "@supernova/contracts/services/configuration/procedures";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {UpdateExtensionsError} from "@supernova/contracts/services/extensions/procedures";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {FolderCreatePayload, FolderFilesListPayload, FolderSuggestionsListPayload} from "@supernova/contracts/services/folders/procedures";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {
  ProjectSessionArchiveError,
  ProjectSessionArchivePayload,
  ProjectSessionPinPayload,
  ProjectSessionsListPayload,
  ProjectSessionsSearchPayload,
} from "@supernova/contracts/services/projects/procedures";
import {ProjectsService} from "@supernova/contracts/services/projects/services";
import {
  ProviderLoginCancelPayload,
  ProviderLoginError,
  ProviderLoginInputSubmitPayload,
  ProviderLoginStartPayload,
  ProviderLogoutPayload,
} from "@supernova/contracts/services/providers/procedures";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {
  CheckpointNavigationError,
  CompactSessionPayload,
  LoadHistoryPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
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
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import type {SessionDirectoryState} from "@supernova/contracts/services/sessions/services";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {
  TerminalClosePayload,
  TerminalOpenPayload,
  TerminalResizePayload,
  TerminalWritePayload,
  WorkspaceBranchesListPayload,
  WorkspaceChangesGetPayload,
  WorkspaceDiffContentsGetPayload,
  WorkspaceFileReadPayload,
  WorkspaceFilesListPayload,
  WorkspaceRepositoriesListPayload,
} from "@supernova/contracts/services/workspace/procedures";
import type {TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {TerminalError, TerminalNotFoundError, WorkspaceFileError, WorkspaceGitError} from "@supernova/contracts/services/workspace/schemas";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import type {z} from "zod";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";
import {archiveSession, createSession, pinSession} from "@supernova/agent-runtime/session-operations";

/** Payloads cross a trust boundary, so each is parsed. `error` types the method's result. */
interface Operation<P extends z.ZodType, R, E extends ErrorValue> {
  readonly payload: P;
  readonly run: (payload: z.infer<P>) => R | Promise<R>;
  readonly error?: E;
}

/** Chord carries only its own error codes, so a declared error travels as data; everything else is a `GenericError`. */
async function run<P extends z.ZodType, R, E extends ErrorValue = never>(operation: Operation<P, R, E>, input: unknown): Promise<ServiceResult<R, ErrorOf<E>>> {
  // Clients see only the code and message; the cause (file paths, stack) stays in the server log.
  const fail = (error: TaggedErrorInstance) => {
    console.error(`[runtime] ${error._tag}: ${error.message}`, ...(error.cause === undefined ? [] : [error.cause]));
    return {ok: false, error: {code: error._tag, message: error.message}} as ServiceResult<R, ErrorOf<E>>;
  };

  const parsed = operation.payload.safeParse(input);
  if (!parsed.success) return fail(new GenericError({cause: parsed.error, message: "The request is invalid."}));

  try {
    const value = await operation.run(parsed.data);
    return {ok: true, value: (value === undefined ? null : value) as R};
  } catch (cause) {
    if (operation.error !== undefined && cause instanceof operation.error) return fail(cause as TaggedErrorInstance);
    return fail(new GenericError({cause, message: errorMessage(cause, "The operation failed.")}));
  }
}

function method<P extends z.ZodType, R, E extends ErrorValue = never>(operation: Operation<P, R, E>): (payload: z.infer<P>) => Promise<ServiceResult<R, ErrorOf<E>>> {
  return (payload) => run(operation, payload);
}

function action<R, E extends ErrorValue = never>(operation: Omit<Operation<z.ZodNull, R, E>, "payload">): (payload: null) => Promise<ServiceResult<R, ErrorOf<E>>> {
  const nullPayload = {safeParse: () => ({success: true, data: null})} as unknown as z.ZodNull;
  return (payload) => run({...operation, payload: nullPayload}, payload);
}

/** Features own their state, which outlives every client; a service copies it into a cell and serves the cell. */
export function serveRuntime(host: Pick<Host, "serve">, runtime: AgentRuntime): void {
  const {configuration, extensions, folders, projects, providers, sessionRuntime, sessions, workspace} = runtime;

  host.serve(ConfigurationService, () => ({
    kind: "default",
    get: method({payload: GetConfigurationPayload, run: (input) => configuration.get(input)}),
  }));

  host.serve(ExtensionsService, () => ({
    kind: "default",
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
  }));

  host.serve(FoldersService, () => ({
    kind: "default",
    create: method({payload: FolderCreatePayload, run: (input) => folders.create(input)}),
    listSuggestions: method({payload: FolderSuggestionsListPayload, run: (input) => folders.listSuggestions(input)}),
    listFiles: method({payload: FolderFilesListPayload, run: (input) => folders.listFiles(input)}),
  }));

  host.serve(ProjectsService, () => ({
    kind: "default",
    listSessions: method({payload: ProjectSessionsListPayload, run: (input) => projects.listSessions(input)}),
    searchSessions: method({payload: ProjectSessionsSearchPayload, run: (input) => projects.searchSessions(input)}),
    pinSession: method({payload: ProjectSessionPinPayload, run: (input) => pinSession(runtime, input)}),
    archiveSession: method({payload: ProjectSessionArchivePayload, run: (input) => archiveSession(runtime, input), error: ProjectSessionArchiveError}),
  }));

  host.serve(ProvidersService, (_input, _principal, self) => {
    // The logins feature owns every login, so a login outlives its client; this cell follows it.
    const state = self.state({logins: cell(json<ProviderLoginsState>(), providers.logins.value)});
    self.listen({logins: listener(providers.logins, (logins, ctx) => state.logins.replace(ctx, logins, {diff: true}))});
    return {
      kind: "default",
      logins: state.logins,
      list: action({run: () => providers.list()}),
      logout: method({payload: ProviderLogoutPayload, run: (input) => providers.logout(input)}),
      startLogin: method({payload: ProviderLoginStartPayload, run: (input) => providers.startLogin(input), error: ProviderLoginError}),
      submitLoginInput: method({payload: ProviderLoginInputSubmitPayload, run: (input) => providers.submitLoginInput(input), error: ProviderLoginError}),
      cancelLogin: method({payload: ProviderLoginCancelPayload, run: (input) => providers.cancelLogin(input), error: ProviderLoginError}),
    };
  });

  host.serve(WorkspaceService, (_input, _principal, self) => {
    // Output is not here: each terminal's is its own `TerminalService`, sent only to clients showing it.
    const state = self.state({terminals: cell(json<TerminalsState>(), workspace.terminals.value)});
    self.listen({terminals: listener(workspace.terminals, (terminals, ctx) => state.terminals.replace(ctx, terminals, {diff: true}))});
    return {
      kind: "default",
      terminals: state.terminals,
      openTerminal: method({payload: TerminalOpenPayload, run: (input) => workspace.openTerminal(input), error: TerminalError}),
      closeTerminal: method({payload: TerminalClosePayload, run: (input) => workspace.closeTerminal(input).then(() => null)}),
      listBranches: method({payload: WorkspaceBranchesListPayload, run: (input) => workspace.listBranches(input), error: WorkspaceGitError}),
      getChanges: method({payload: WorkspaceChangesGetPayload, run: (input) => workspace.getChanges(input), error: WorkspaceGitError}),
      getDiffContents: method({payload: WorkspaceDiffContentsGetPayload, run: (input) => workspace.getDiffContents(input), error: WorkspaceFileError}),
      listRepositories: method({payload: WorkspaceRepositoriesListPayload, run: (input) => workspace.listRepositories(input)}),
      listFiles: method({payload: WorkspaceFilesListPayload, run: (input) => workspace.listFiles(input), error: WorkspaceGitError}),
      readFile: method({payload: WorkspaceFileReadPayload, run: (input) => workspace.readFile(input), error: WorkspaceFileError}),
    };
  });

  host.serve(TerminalService, ({terminalId}, _principal, self) => {
    // Holding an unknown or closed terminal fails. Releasing never ends the shell.
    const res = self.resources({output: resource({rev: 1, open: () => workspace.terminalOutput(terminalId)})});
    // A placeholder until the terminal's first value, delivered as the object goes live and before any call.
    const state = self.state({output: cell(json<TerminalOutput>(), {output: "", dropped: 0})});
    self.listen({
      output: listener(
        res.output,
        (output) => output,
        (output, ctx) => state.output.replace(ctx, output, {diff: true})
      ),
    });
    return {
      kind: "default",
      output: state.output,
      write: method({
        payload: TerminalWritePayload.omit({id: true}),
        run: (input) => workspace.writeTerminal({...input, id: terminalId}).then(() => null),
        error: TerminalNotFoundError,
      }),
      resize: method({
        payload: TerminalResizePayload.omit({id: true}),
        run: (input) => workspace.resizeTerminal({...input, id: terminalId}).then(() => null),
        error: TerminalNotFoundError,
      }),
    };
  });

  host.serve(SessionsService, (_input, _principal, self) => {
    // Served here, not on session runtime, because a client reads it before following any session.
    const state = self.state({directory: cell(json<SessionDirectoryState>(), sessionRuntime.board.state.value)});
    self.listen({directory: listener(sessionRuntime.board.state, (directory, ctx) => state.directory.replace(ctx, directory, {diff: true}))});
    return {
      kind: "default",
      directory: state.directory,
      create: method({payload: CreateSessionPayload, run: (input) => createSession(runtime, input), error: CreateSessionError}),
      fork: method({payload: ForkSessionPayload, run: (input) => sessions.fork(input), error: ForkSessionError}),
      rename: method({payload: RenameSessionPayload, run: (input) => sessions.rename(input), error: RenameSessionError}),
      get: method({payload: GetSessionPayload, run: (input) => sessions.get(input)}),
      listModels: method({payload: ListModelsPayload, run: (input) => sessions.listModels(input)}),
      listComposerSuggestions: method({payload: ListComposerSuggestionsPayload, run: (input) => sessions.listComposerSuggestions(input)}),
    };
  });

  host.serve(SessionRuntimeService, ({sessionId}, _principal, self) => {
    // Holding an unknown session fails. Releasing never stops the session's work.
    const res = self.resources({
      document: resource({
        rev: 1,
        open: async () => {
          if (!(await sessions.exists({sessionId}))) throw new Error("Session not found.");
          return sessionRuntime.transcript(sessionId);
        },
      }),
    });
    // A placeholder until the worker's first document, delivered as the object goes live and before any call.
    const state = self.state({session: cell(json<Session>(), {} as Session)});
    self.listen({
      document: listener(
        res.document,
        (document) => document,
        (session, ctx) => state.session.replace(ctx, session, {diff: true})
      ),
    });
    return {
      kind: "default",
      session: state.session,
      loadHistory: method({payload: LoadHistoryPayload.omit({sessionId: true}), run: (input) => sessionRuntime.loadHistory({...input, sessionId})}),
      sendMessage: method({payload: SendMessagePayload.omit({sessionId: true}), run: (input) => sessionRuntime.sendMessage({...input, sessionId}).then(() => null)}),
      compact: method({payload: CompactSessionPayload.omit({sessionId: true}), run: (input) => sessionRuntime.compact({...input, sessionId}).then(() => null)}),
      undoCheckpoint: method({
        payload: UndoCheckpointPayload.omit({sessionId: true}),
        error: CheckpointNavigationError,
        run: (input) => sessionRuntime.undoCheckpoint({...input, sessionId}).then(() => null),
      }),
      redoCheckpoint: method({
        payload: UndoCheckpointPayload.omit({sessionId: true}),
        error: CheckpointNavigationError,
        run: (input) => sessionRuntime.redoCheckpoint({...input, sessionId}).then(() => null),
      }),
      revertToMessage: method({
        payload: RevertToMessagePayload.omit({sessionId: true}),
        error: CheckpointNavigationError,
        run: (input) => sessionRuntime.revertToMessage({...input, sessionId}).then(() => null),
      }),
      abort: action({run: () => sessionRuntime.abort({sessionId}).then(() => null)}),
    };
  });
}
