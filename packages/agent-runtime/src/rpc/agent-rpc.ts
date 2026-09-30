import {AgentRpcGroup} from "@supernova/contracts";
import {GetConfigurationError} from "@supernova/contracts/configuration/procedures";
import {UpdateExtensionsError} from "@supernova/contracts/extensions/procedures";
import {FolderCreateError, FolderFilesListError, FolderSuggestionsListError} from "@supernova/contracts/folders/procedures";
import {ProjectSessionArchiveError, ProjectSessionsListError} from "@supernova/contracts/projects/procedures";
import {ProviderLoginError, ProviderLogoutError, ProvidersListError} from "@supernova/contracts/providers/procedures";
import {CheckpointConflictError, CheckpointGenericError, CheckpointInheritedError, CheckpointUncapturedError} from "@supernova/contracts/session-runtime/procedures";
import {CreateSessionError, ForkSessionError, ListComposerSuggestionsError, ListModelsError, LoadSessionError, RenameSessionError} from "@supernova/contracts/sessions/procedures";
import {TerminalError, TerminalNotFoundError} from "@supernova/contracts/terminals/schemas";
import {
  WorkspaceBinaryFileError,
  WorkspaceFileNotFoundError,
  WorkspaceFileTooLargeError,
  WorkspaceGenericError,
  WorkspaceNotARepositoryError,
} from "@supernova/contracts/workspace/schemas";
import {Effect, Stream} from "effect";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {Workflow} from "@supernova/agent-runtime/lib/workflow";
import {oneOf, run, runSync} from "@supernova/agent-runtime/rpc/edge";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

const isWorkspaceGitError = oneOf(WorkspaceGenericError, WorkspaceNotARepositoryError);
const isWorkspaceFileError = oneOf(WorkspaceGenericError, WorkspaceNotARepositoryError, WorkspaceFileNotFoundError, WorkspaceBinaryFileError, WorkspaceFileTooLargeError);

/** Error the client sees for an error class the operation did not declare. */
function fallback<E>(Error: new (fields: {cause: unknown; message: string}) => E, message: string) {
  return (cause: unknown): E => new Error({cause, message: errorMessage(cause, message)});
}

const isCheckpointError = oneOf(CheckpointConflictError, CheckpointGenericError, CheckpointInheritedError, CheckpointUncapturedError);
const checkpointFailure = (cause: unknown) => new CheckpointGenericError({cause, message: errorMessage(cause, "Failed to change the session checkpoint.")});

/** Adapts every RPC procedure to its feature function. The only place Effect meets the features. */
export function agentRpcLayer(runtime: AgentRuntime) {
  const {configuration, extensions, folders, projects, providers, sessionRuntime, sessions, workspace, worktrees} = runtime;
  const isTerminalError = oneOf(TerminalError, TerminalNotFoundError);
  const terminalFailure = fallback(TerminalError, "Terminal operation failed.");

  return AgentRpcGroup.toLayer({
    abortSession: (input) => Effect.promise(() => sessionRuntime.abort(input)),
    archiveProjectSession: (input) =>
      run(
        async () => {
          const worktree = await sessions.getWorktree(input);
          // Shells go first so a removed worktree is not still someone's cwd.
          await workspace.closeSessionTerminals(input.sessionId);
          await sessionRuntime.release({sessionId: input.sessionId, workspacePath: worktree?.path ?? input.projectPath});
          const result = await projects.archiveSession(input);
          if (worktree && input.removeWorktree) await worktrees.remove({projectPath: input.projectPath, worktree});
          return result;
        },
        oneOf(ProjectSessionArchiveError),
        fallback(ProjectSessionArchiveError, "Failed to archive project session.")
      ),
    closeTerminal: (input) => run(() => workspace.closeTerminal(input), oneOf(TerminalError), terminalFailure),
    cancelProviderLogin: (input) => runSync(() => providers.cancelLogin(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to cancel provider login.")),
    compactSession: (input) => Effect.promise(() => sessionRuntime.compact(input)),
    createFolder: (input) => run(() => folders.create(input), oneOf(FolderCreateError), fallback(FolderCreateError, "Failed to create folder.")),
    // Setup is all-or-nothing: when a required step fails, everything before it is undone and the client keeps nothing.
    createSession: ({id, message, projectPath, workspace: selection}) =>
      run(
        async () => {
          const workflow = new Workflow();
          const worktree =
            selection?.mode === "worktree" && id !== undefined
              ? await workflow.step({
                  name: "worktree",
                  required: true,
                  run: async () => {
                    sessionRuntime.publishSetup({phase: "started", sessionId: id, step: "worktree"});
                    try {
                      const value = await worktrees.create({baseRef: selection.baseRef, projectPath});
                      return {value, undo: () => worktrees.remove({projectPath, worktree: value})};
                    } finally {
                      sessionRuntime.publishSetup({phase: "ended", sessionId: id, step: "worktree"});
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
          await workflow.step({
            name: "first-turn",
            required: true,
            run: async () => {
              try {
                await sessionRuntime.sendMessage({...message, sessionId: session.id});
              } catch (cause) {
                await sessionRuntime.release({sessionId: session.id, workspacePath: worktree?.path ?? projectPath});
                throw new CreateSessionError({cause, message: errorMessage(cause, "Failed to start the session.")});
              }
              return {value: undefined};
            },
          });
          return session;
        },
        oneOf(CreateSessionError),
        fallback(CreateSessionError, "Failed to create session.")
      ),
    forkSession: (input) => run(() => sessions.fork(input), oneOf(ForkSessionError), fallback(ForkSessionError, "Failed to fork session.")),
    getConfiguration: (input) => runSync(() => configuration.get(input), oneOf(GetConfigurationError), fallback(GetConfigurationError, "Unable to load configuration.")),
    getSession: (input) =>
      run(async () => sessionRuntime.getCommittedSession(input) ?? sessions.get(input), oneOf(LoadSessionError), fallback(LoadSessionError, "Failed to load session.")),
    getWorkspaceChanges: (input) => run(() => workspace.getChanges(input), isWorkspaceGitError, fallback(WorkspaceGenericError, "Workspace operation failed.")),
    getWorkspaceDiffContents: (input) => run(() => workspace.getDiffContents(input), isWorkspaceFileError, fallback(WorkspaceGenericError, "Workspace operation failed.")),
    listComposerSuggestions: (input) =>
      run(() => sessions.listComposerSuggestions(input), oneOf(ListComposerSuggestionsError), fallback(ListComposerSuggestionsError, "Failed to list composer suggestions.")),
    listFolderFiles: (input) => run(() => folders.listFiles(input), oneOf(FolderFilesListError), fallback(FolderFilesListError, "Failed to list folder files.")),
    listFolderSuggestions: (input) =>
      run(() => folders.listSuggestions(input), oneOf(FolderSuggestionsListError), fallback(FolderSuggestionsListError, "Failed to list folder suggestions.")),
    listModels: (input) => run(() => sessions.listModels(input), oneOf(ListModelsError), fallback(ListModelsError, "Failed to list session models.")),
    listProjectSessions: (input) =>
      run(() => projects.listSessions(input), oneOf(ProjectSessionsListError), fallback(ProjectSessionsListError, "Failed to list project sessions.")),
    listProviders: () => run(() => providers.list(), oneOf(ProvidersListError), fallback(ProvidersListError, "Failed to list providers.")),
    listTerminals: (input) => run(() => workspace.listTerminals(input), oneOf(TerminalError), terminalFailure),
    listWorkspaceBranches: (input) => run(() => workspace.listBranches(input), isWorkspaceGitError, fallback(WorkspaceGenericError, "Workspace operation failed.")),
    listWorkspaceFiles: (input) => run(() => workspace.listFiles(input), isWorkspaceGitError, fallback(WorkspaceGenericError, "Workspace operation failed.")),
    listWorkspaceRepositories: (input) =>
      run(() => workspace.listRepositories(input), oneOf(WorkspaceGenericError), fallback(WorkspaceGenericError, "Workspace operation failed.")),
    openTerminal: (input) => run(() => workspace.openTerminal(input), oneOf(TerminalError), terminalFailure),
    logoutProvider: (input) => run(() => providers.logout(input), oneOf(ProviderLogoutError), fallback(ProviderLogoutError, "Failed to disconnect provider.")),
    readWorkspaceFile: (input) => run(() => workspace.readFile(input), isWorkspaceFileError, fallback(WorkspaceGenericError, "Workspace operation failed.")),
    redoCheckpoint: (input) => run(() => sessionRuntime.redoCheckpoint(input), isCheckpointError, checkpointFailure),
    renameSession: (input) => run(() => sessions.rename(input), oneOf(RenameSessionError), fallback(RenameSessionError, "Failed to rename session.")),
    resizeTerminal: (input) => run(() => workspace.resizeTerminal(input), isTerminalError, terminalFailure),
    revertToMessage: (input) => run(() => sessionRuntime.revertToMessage(input), isCheckpointError, checkpointFailure),
    sendMessage: (input) => Effect.promise(() => sessionRuntime.sendMessage(input)),
    startProviderLogin: (input) => run(() => providers.startLogin(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to start provider login.")),
    submitProviderLoginInput: (input) =>
      runSync(() => providers.submitLoginInput(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to submit provider login input.")),
    undoCheckpoint: (input) => run(() => sessionRuntime.undoCheckpoint(input), isCheckpointError, checkpointFailure),
    updateExtensions: () =>
      run(
        async () => {
          try {
            await extensions.update();
          } finally {
            // Even a partial failure may have replaced packages on disk, so every session reloads either way.
            sessionRuntime.reloadExtensions();
          }
        },
        oneOf(UpdateExtensionsError),
        fallback(UpdateExtensionsError, "Failed to update extensions.")
      ),
    watchEvents: () => Stream.fromAsyncIterable(sessionRuntime.watchEvents(), (cause) => cause as never),
    watchTerminal: (input) =>
      Stream.unwrap(
        Effect.map(
          run(() => workspace.watchTerminal(input), isTerminalError, terminalFailure),
          (events) => Stream.fromAsyncIterable(events, (cause) => terminalFailure(cause))
        )
      ),
    writeTerminal: (input) => run(() => workspace.writeTerminal(input), isTerminalError, terminalFailure),
    watchProviderLoginSession: (input) =>
      Stream.fromAsyncIterable(providers.watchLoginSession(input), (cause) =>
        cause instanceof ProviderLoginError ? cause : new ProviderLoginError({cause, message: errorMessage(cause, "Failed to watch provider login session.")})
      ),
  });
}

export type AgentRpcLayer = ReturnType<typeof agentRpcLayer>;
