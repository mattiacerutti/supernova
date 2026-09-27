import {AgentRpcGroup} from "@supernova/contracts";
import {GetConfigurationError} from "@supernova/contracts/configuration/procedures";
import {FolderCreateError, FolderFilesListError, FolderSuggestionsListError} from "@supernova/contracts/folders/procedures";
import {ProjectSessionArchiveError, ProjectSessionsListError} from "@supernova/contracts/projects/procedures";
import {ProviderLoginError, ProviderLogoutError, ProvidersListError} from "@supernova/contracts/providers/procedures";
import {CheckpointConflictError, CheckpointGenericError, CheckpointUncapturedError} from "@supernova/contracts/session-runtime/procedures";
import {CreateSessionError, ListComposerSuggestionsError, ListModelsError, LoadSessionError, RenameSessionError} from "@supernova/contracts/sessions/procedures";
import {
  WorkspaceBinaryFileError,
  WorkspaceFileNotFoundError,
  WorkspaceFileTooLargeError,
  WorkspaceGenericError,
  WorkspaceNotARepositoryError,
} from "@supernova/contracts/workspace/schemas";
import {Effect, Stream} from "effect";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";
import {oneOf, run, runSync} from "@supernova/agent-runtime/rpc/edge";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

const isWorkspaceGitError = oneOf(WorkspaceGenericError, WorkspaceNotARepositoryError);
const isWorkspaceFileError = oneOf(WorkspaceGenericError, WorkspaceNotARepositoryError, WorkspaceFileNotFoundError, WorkspaceBinaryFileError, WorkspaceFileTooLargeError);

/** Error the client sees for an error class the operation did not declare. */
function fallback<E>(Error: new (fields: {cause: unknown; message: string}) => E, message: string) {
  return (cause: unknown): E => new Error({cause, message: errorMessage(cause, message)});
}

const isCheckpointError = oneOf(CheckpointConflictError, CheckpointGenericError, CheckpointUncapturedError);
const checkpointFailure = (cause: unknown) => new CheckpointGenericError({cause, message: errorMessage(cause, "Failed to change the session checkpoint.")});

/** Adapts every RPC procedure to its feature function. The only place Effect meets the features. */
export function agentRpcLayer(runtime: AgentRuntime) {
  const {configuration, folders, projects, providers, sessionRuntime, sessions, workspace} = runtime;

  return AgentRpcGroup.toLayer({
    abortSession: (input) => Effect.promise(() => sessionRuntime.abort(input)),
    archiveProjectSession: (input) =>
      run(
        async () => {
          await sessionRuntime.release(input);
          return projects.archiveSession(input);
        },
        oneOf(ProjectSessionArchiveError),
        fallback(ProjectSessionArchiveError, "Failed to archive project session.")
      ),
    cancelProviderLogin: (input) => runSync(() => providers.cancelLogin(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to cancel provider login.")),
    compactSession: (input) => Effect.promise(() => sessionRuntime.compact(input)),
    createFolder: (input) => run(() => folders.create(input), oneOf(FolderCreateError), fallback(FolderCreateError, "Failed to create folder.")),
    createSession: ({id, message, projectPath}) =>
      run(
        async () => {
          const session = await sessions.create({id, projectPath});
          if (!message) return session;

          // Setup is all-or-nothing: a session whose first turn cannot start is removed again.
          try {
            await sessionRuntime.sendMessage({...message, sessionId: session.id});
          } catch (cause) {
            await sessionRuntime.release({projectPath, sessionId: session.id});
            await sessions.delete({sessionId: session.id});
            throw new CreateSessionError({cause, message: errorMessage(cause, "Failed to start the session.")});
          }
          return session;
        },
        oneOf(CreateSessionError),
        fallback(CreateSessionError, "Failed to create session.")
      ),
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
    listWorkspaceFiles: (input) => run(() => workspace.listFiles(input), isWorkspaceGitError, fallback(WorkspaceGenericError, "Workspace operation failed.")),
    listWorkspaceRepositories: (input) =>
      run(() => workspace.listRepositories(input), oneOf(WorkspaceGenericError), fallback(WorkspaceGenericError, "Workspace operation failed.")),
    logoutProvider: (input) => run(() => providers.logout(input), oneOf(ProviderLogoutError), fallback(ProviderLogoutError, "Failed to disconnect provider.")),
    readWorkspaceFile: (input) => run(() => workspace.readFile(input), isWorkspaceFileError, fallback(WorkspaceGenericError, "Workspace operation failed.")),
    redoCheckpoint: (input) => run(() => sessionRuntime.redoCheckpoint(input), isCheckpointError, checkpointFailure),
    renameSession: (input) => run(() => sessions.rename(input), oneOf(RenameSessionError), fallback(RenameSessionError, "Failed to rename session.")),
    revertToMessage: (input) => run(() => sessionRuntime.revertToMessage(input), isCheckpointError, checkpointFailure),
    sendMessage: (input) => Effect.promise(() => sessionRuntime.sendMessage(input)),
    startProviderLogin: (input) => run(() => providers.startLogin(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to start provider login.")),
    submitProviderLoginInput: (input) =>
      runSync(() => providers.submitLoginInput(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to submit provider login input.")),
    undoCheckpoint: (input) => run(() => sessionRuntime.undoCheckpoint(input), isCheckpointError, checkpointFailure),
    watchEvents: () => Stream.fromAsyncIterable(sessionRuntime.watchEvents(), (cause) => cause as never),
    watchProviderLoginSession: (input) =>
      Stream.fromAsyncIterable(providers.watchLoginSession(input), (cause) =>
        cause instanceof ProviderLoginError ? cause : new ProviderLoginError({cause, message: errorMessage(cause, "Failed to watch provider login session.")})
      ),
  });
}

export type AgentRpcLayer = ReturnType<typeof agentRpcLayer>;
