import {Context, Effect} from "effect";
import type {
  ProjectSessionArchiveError,
  ProjectSessionsListError,
  ProjectSessionArchiveResult,
  ProjectSessionsListResult,
} from "@supernova/contracts/projects/procedures";

export interface ProjectsServiceShape {
  readonly archiveSession: (projectPath: string, sessionId: string) => Effect.Effect<ProjectSessionArchiveResult, ProjectSessionArchiveError>;
  readonly listSessions: (input: {projectPath: string}) => Effect.Effect<ProjectSessionsListResult, ProjectSessionsListError>;
}

export class ProjectsService extends Context.Service<ProjectsService, ProjectsServiceShape>()("supernova/agent-runtime/ProjectsService") {}
