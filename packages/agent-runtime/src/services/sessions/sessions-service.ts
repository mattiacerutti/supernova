import {Context, Effect} from "effect";
import type {Stream} from "effect";
import type {
  AgentSessionLoadError,
  AgentSessionModelsListError,
  AgentSessionStreamEvent,
  IAgentSessionDetails,
  IAgentModelReference,
  IAgentSessionModelsListResult,
} from "@pi-desktop/contracts/sessions";

export interface ISessionsService {
  readonly get: (sessionId: string) => Effect.Effect<IAgentSessionDetails, AgentSessionLoadError>;
  readonly listModels: () => Effect.Effect<IAgentSessionModelsListResult, AgentSessionModelsListError>;
  readonly sendMessage: (input: {message: string; model: IAgentModelReference; sessionId: string}) => Stream.Stream<AgentSessionStreamEvent>;
}

export class SessionsService extends Context.Service<SessionsService, ISessionsService>()("pi-desktop/agent-runtime/SessionsService") {}
