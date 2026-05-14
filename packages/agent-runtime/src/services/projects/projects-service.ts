import {Context, Effect} from "effect";
import type {
  ProjectSessionArchiveError,
  ProjectSessionsListError,
  ProjectSessionArchiveResult,
  ProjectSessionsListResult,
} from "@pi-desktop/contracts/projects/procedures";

export interface ProjectsServiceShape {
  readonly archiveSession: (projectPath: string, sessionId: string) => Effect.Effect<ProjectSessionArchiveResult, ProjectSessionArchiveError>;
  readonly listSessions: (input: {cursor?: string; limit?: number; projectPath: string}) => Effect.Effect<ProjectSessionsListResult, ProjectSessionsListError>;
}

export class ProjectsService extends Context.Service<ProjectsService, ProjectsServiceShape>()("pi-desktop/agent-runtime/ProjectsService") {}
