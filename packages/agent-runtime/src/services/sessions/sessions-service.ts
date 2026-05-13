import {Context, Effect} from "effect";
import type {Stream} from "effect";
import type {
  AgentSessionCreateError,
  AgentSessionLoadError,
  AgentSessionMessageSendPayload,
  AgentSessionModelsListError,
  AgentSessionStreamEvent,
  AgentSessionModelsListResult,
} from "@pi-desktop/contracts/sessions/procedures";
import type {AgentSessionDetails} from "@pi-desktop/contracts/sessions/schemas";

export interface SessionsServiceShape {
  readonly create: (projectPath: string) => Effect.Effect<AgentSessionDetails, AgentSessionCreateError>;
  readonly get: (sessionId: string) => Effect.Effect<AgentSessionDetails, AgentSessionLoadError>;
  readonly listModels: () => Effect.Effect<AgentSessionModelsListResult, AgentSessionModelsListError>;
  readonly sendMessage: (input: AgentSessionMessageSendPayload) => Stream.Stream<AgentSessionStreamEvent>;
}

export class SessionsService extends Context.Service<SessionsService, SessionsServiceShape>()("pi-desktop/agent-runtime/SessionsService") {}
