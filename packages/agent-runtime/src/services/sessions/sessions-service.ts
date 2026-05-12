import {Context, Effect} from "effect";
import type {Stream} from "effect";
import type {
  AgentSessionCreateError,
  AgentSessionLoadError,
  AgentSessionModelsListError,
  AgentSessionStreamEvent,
  IAgentSessionModelsListResult,
} from "@pi-desktop/contracts/sessions/procedures";
import type {IAgentSessionDetails, IAgentModelReference} from "@pi-desktop/contracts/sessions/schemas";

export interface ISessionsService {
  readonly create: (projectPath: string) => Effect.Effect<IAgentSessionDetails, AgentSessionCreateError>;
  readonly get: (sessionId: string) => Effect.Effect<IAgentSessionDetails, AgentSessionLoadError>;
  readonly listModels: () => Effect.Effect<IAgentSessionModelsListResult, AgentSessionModelsListError>;
  readonly sendMessage: (input: {message: string; model: IAgentModelReference; sessionId: string}) => Stream.Stream<AgentSessionStreamEvent>;
}

export class SessionsService extends Context.Service<SessionsService, ISessionsService>()("pi-desktop/agent-runtime/SessionsService") {}
