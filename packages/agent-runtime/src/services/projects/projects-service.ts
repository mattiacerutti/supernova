import {Context, Effect} from "effect";
import type {AgentProjectsListError, IAgentProjectsListResult} from "@pi-desktop/contracts";

export interface IProjectsService {
  readonly list: Effect.Effect<IAgentProjectsListResult, AgentProjectsListError>;
}

export class ProjectsService extends Context.Service<ProjectsService, IProjectsService>()("pi-desktop/agent-runtime/ProjectsService") {}
