import {Context, Effect} from "effect";
import type {
  AgentProjectSessionArchiveError,
  AgentProjectSessionsListError,
  IAgentProjectSessionArchiveResult,
  IAgentProjectSessionsListResult,
} from "@pi-desktop/contracts/projects";

export interface IProjectsService {
  readonly archiveSession: (projectPath: string, sessionId: string) => Effect.Effect<IAgentProjectSessionArchiveResult, AgentProjectSessionArchiveError>;
  readonly listSessions: (input: {cursor?: string; limit?: number; projectPath: string}) => Effect.Effect<IAgentProjectSessionsListResult, AgentProjectSessionsListError>;
}

export class ProjectsService extends Context.Service<ProjectsService, IProjectsService>()("pi-desktop/agent-runtime/ProjectsService") {}
