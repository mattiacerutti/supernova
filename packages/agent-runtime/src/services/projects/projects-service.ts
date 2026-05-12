import {Context, Effect} from "effect";
import type {
  AgentProjectSessionArchiveError,
  AgentProjectSessionsListError,
  AgentProjectSessionArchiveResult,
  AgentProjectSessionsListResult,
} from "@pi-desktop/contracts/projects/procedures";

export interface ProjectsServiceShape {
  readonly archiveSession: (projectPath: string, sessionId: string) => Effect.Effect<AgentProjectSessionArchiveResult, AgentProjectSessionArchiveError>;
  readonly listSessions: (input: {cursor?: string; limit?: number; projectPath: string}) => Effect.Effect<AgentProjectSessionsListResult, AgentProjectSessionsListError>;
}

export class ProjectsService extends Context.Service<ProjectsService, ProjectsServiceShape>()("pi-desktop/agent-runtime/ProjectsService") {}
