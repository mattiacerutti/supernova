import {AgentRpcGroup} from "@pi-desktop/contracts";
import {Effect} from "effect";
import {FoldersService} from "@pi-desktop/agent-runtime/services/folders/folders-service";
import {ProjectsService} from "@pi-desktop/agent-runtime/services/projects/projects-service";

export const AgentRpcLive = AgentRpcGroup.toLayer(
  Effect.gen(function* () {
    const folders = yield* FoldersService;
    const projects = yield* ProjectsService;

    return {
      archiveProjectSession: ({projectPath, sessionId}) => projects.archiveSession(projectPath, sessionId),
      listFolderSuggestions: ({query}) => folders.listSuggestions(query),
      listProjectSessions: (input) => projects.listSessions(input),
    };
  })
);
