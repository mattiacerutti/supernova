import {AgentRpcGroup} from "@supernova/contracts";
import {GetConfigurationError} from "@supernova/contracts/configuration/procedures";
import {UpdateExtensionsError} from "@supernova/contracts/extensions/procedures";
import {FolderCreateError, FolderFilesListError, FolderSuggestionsListError} from "@supernova/contracts/folders/procedures";
import {ProjectSessionArchiveError, ProjectSessionsListError} from "@supernova/contracts/projects/procedures";
import {ProviderLoginError, ProviderLogoutError, ProvidersListError} from "@supernova/contracts/providers/procedures";
import {ListComposerSuggestionsError, ListModelsError} from "@supernova/contracts/sessions/procedures";
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
import {oneOf, run, runSync} from "@supernova/agent-runtime/rpc/edge";
import {archiveSession} from "@supernova/agent-runtime/rpc/session-workflows";
import type {AgentRuntime} from "@supernova/agent-runtime/runtime";

const isWorkspaceGitError = oneOf(WorkspaceGenericError, WorkspaceNotARepositoryError);
const isWorkspaceFileError = oneOf(WorkspaceGenericError, WorkspaceNotARepositoryError, WorkspaceFileNotFoundError, WorkspaceBinaryFileError, WorkspaceFileTooLargeError);

/** Error the client sees for an error class the operation did not declare. */
function fallback<E>(Error: new (fields: {cause: unknown; message: string}) => E, message: string) {
  return (cause: unknown): E => new Error({cause, message: errorMessage(cause, message)});
}

/**
 * Adapts every RPC procedure to its feature function. The only place Effect meets the features. Session lifecycle and
 * execution are Chord services instead; see `session-services.ts`.
 */
export function agentRpcLayer(runtime: AgentRuntime) {
  const {configuration, extensions, folders, projects, providers, sessionRuntime, sessions, workspace} = runtime;
  const isTerminalError = oneOf(TerminalError, TerminalNotFoundError);
  const terminalFailure = fallback(TerminalError, "Terminal operation failed.");

  return AgentRpcGroup.toLayer({
    archiveProjectSession: (input) =>
      run(() => archiveSession(runtime, input), oneOf(ProjectSessionArchiveError), fallback(ProjectSessionArchiveError, "Failed to archive project session.")),
    closeTerminal: (input) => run(() => workspace.closeTerminal(input), oneOf(TerminalError), terminalFailure),
    cancelProviderLogin: (input) => runSync(() => providers.cancelLogin(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to cancel provider login.")),
    createFolder: (input) => run(() => folders.create(input), oneOf(FolderCreateError), fallback(FolderCreateError, "Failed to create folder.")),
    getConfiguration: (input) => runSync(() => configuration.get(input), oneOf(GetConfigurationError), fallback(GetConfigurationError, "Unable to load configuration.")),
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
    resizeTerminal: (input) => run(() => workspace.resizeTerminal(input), isTerminalError, terminalFailure),
    startProviderLogin: (input) => run(() => providers.startLogin(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to start provider login.")),
    submitProviderLoginInput: (input) =>
      runSync(() => providers.submitLoginInput(input), oneOf(ProviderLoginError), fallback(ProviderLoginError, "Failed to submit provider login input.")),
    updateExtensions: () =>
      run(
        async () => {
          try {
            await extensions.update();
          } finally {
            // Even a partial failure may have replaced packages on disk, so every session reloads either way.
            await sessionRuntime.reloadExtensions();
          }
        },
        oneOf(UpdateExtensionsError),
        fallback(UpdateExtensionsError, "Failed to update extensions.")
      ),
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
