import {Context, Effect} from "effect";
import type {AgentProjectSessionsListError, IAgentProjectSessionsListResult} from "@pi-desktop/contracts/projects";

export interface IProjectsService {
  readonly listSessions: (projectPath: string) => Effect.Effect<IAgentProjectSessionsListResult, AgentProjectSessionsListError>;
}

export class ProjectsService extends Context.Service<ProjectsService, IProjectsService>()("pi-desktop/agent-runtime/ProjectsService") {}
