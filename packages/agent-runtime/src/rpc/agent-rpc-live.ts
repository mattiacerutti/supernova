import {AgentRpcGroup} from "@supernova/contracts";
import {Effect} from "effect";
import {FoldersService} from "@supernova/agent-runtime/services/folders-service";
import {ProvidersService} from "@supernova/agent-runtime/services/providers-service";
import {ProjectsService} from "@supernova/agent-runtime/services/projects-service";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime-service";
import {SessionsService} from "@supernova/agent-runtime/services/sessions-service";

export const AgentRpcLive = AgentRpcGroup.toLayer(
  Effect.gen(function* () {
    const folders = yield* FoldersService;
    const providers = yield* ProvidersService;
    const projects = yield* ProjectsService;
    const sessionRuntime = yield* SessionRuntimeService;
    const sessions = yield* SessionsService;

    return {
      abortSession: ({sessionId}) => sessionRuntime.abortSession(sessionId),
      archiveProjectSession: ({projectPath, sessionId}) =>
        Effect.gen(function* () {
          yield* sessionRuntime.releaseSession(sessionId);
          const archived = yield* projects.archiveSession(projectPath, sessionId);
          yield* sessionRuntime.deleteSessionCheckpoints(projectPath, sessionId);
          return archived;
        }),
      cancelProviderLogin: ({loginSessionId}) => providers.cancelLogin(loginSessionId),
      compactSession: (input) => sessionRuntime.compactSession(input),
      createFolder: ({path}) => folders.create(path),
      createSession: ({projectPath}) => sessions.create(projectPath),
      getSession: ({sessionId}) =>
        Effect.flatMap(sessionRuntime.getCommittedSession(sessionId), (committedSession) => (committedSession ? Effect.succeed(committedSession) : sessions.get(sessionId))),
      listFolderFiles: ({projectPath, query}) => folders.listFiles(projectPath, query),
      listFolderSuggestions: ({query}) => folders.listSuggestions(query),
      listProviders: () => providers.list(),
      listProjectSessions: (input) => projects.listSessions(input),
      listComposerSuggestions: ({kind, projectPath, query}) => sessions.listComposerSuggestions(projectPath, kind, query),
      listModels: () => sessions.listModels(),
      logoutProvider: ({providerId}) => providers.logout(providerId),
      redoCheckpoint: (input) => sessionRuntime.redoCheckpoint(input),
      renameSession: (input) => sessions.rename(input),
      revertToMessage: (input) => sessionRuntime.revertToMessage(input),
      sendMessage: (input) => sessionRuntime.sendMessage(input),
      startProviderLogin: ({authType, providerId}) => providers.startLogin(providerId, authType),
      submitProviderLoginInput: ({input, loginSessionId}) => providers.submitLoginInput(loginSessionId, input),
      watchProviderLoginSession: ({loginSessionId}) => providers.watchLoginSession(loginSessionId),
      undoCheckpoint: (input) => sessionRuntime.undoCheckpoint(input),
      watchEvents: () => sessionRuntime.watchEvents(),
    };
  })
);
