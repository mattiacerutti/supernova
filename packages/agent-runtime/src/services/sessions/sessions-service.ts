import {Context, Effect} from "effect";
import type {Stream} from "effect";
import type {
  SessionCreateError,
  SessionComposerSuggestionsListError,
  SessionComposerSuggestionsListResult,
  SessionComposerSuggestionTriggerKind,
  SessionLoadError,
  SessionMessageSendPayload,
  SessionModelsListError,
  SessionStreamEvent,
  SessionModelsListResult,
} from "@supernova/contracts/sessions/procedures";
import type {SessionDetails} from "@supernova/contracts/sessions/schemas";

export interface SessionsServiceShape {
  readonly create: (projectPath: string) => Effect.Effect<SessionDetails, SessionCreateError>;
  readonly get: (sessionId: string) => Effect.Effect<SessionDetails, SessionLoadError>;
  readonly listComposerSuggestions: (
    projectPath: string,
    kind: SessionComposerSuggestionTriggerKind,
    query: string
  ) => Effect.Effect<SessionComposerSuggestionsListResult, SessionComposerSuggestionsListError>;
  readonly listModels: () => Effect.Effect<SessionModelsListResult, SessionModelsListError>;
  readonly sendMessage: (input: SessionMessageSendPayload) => Stream.Stream<SessionStreamEvent>;
}

export class SessionsService extends Context.Service<SessionsService, SessionsServiceShape>()("supernova/agent-runtime/SessionsService") {}
