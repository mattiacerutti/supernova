import {AgentRpcGroup} from "@pi-desktop/contracts";
import {Effect} from "effect";
import {FoldersService} from "@pi-desktop/agent-runtime/services/folders/folders-service";
import {ProvidersService} from "@pi-desktop/agent-runtime/services/providers/providers-service";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";

export const AgentRpcLive = AgentRpcGroup.toLayer(
  Effect.gen(function* () {
    const folders = yield* FoldersService;
    const providers = yield* ProvidersService;
    const projects = yield* ProjectsService;

    return {
      archiveProjectSession: ({projectPath, sessionId}) => projects.archiveSession(projectPath, sessionId),
      cancelProviderLogin: ({loginSessionId}) => providers.cancelLogin(loginSessionId),
      getProviderLoginSession: ({loginSessionId}) => providers.getLoginSession(loginSessionId),
      listFolderSuggestions: ({query}) => folders.listSuggestions(query),
      listProviders: () => providers.list(),
      listProjectSessions: (input) => projects.listSessions(input),
      logoutProvider: ({providerId}) => providers.logout(providerId),
      setProviderApiKey: ({apiKey, providerId}) => providers.setApiKey(providerId, apiKey),
      startProviderOAuthLogin: ({providerId}) => providers.startOAuthLogin(providerId),
      submitProviderLoginInput: ({input, loginSessionId}) => providers.submitLoginInput(loginSessionId, input),
    };
  })
);
