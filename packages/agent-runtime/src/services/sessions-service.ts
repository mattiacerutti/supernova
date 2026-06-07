import {Context, Effect} from "effect";
import type {
  CreateSessionError,
  ListComposerSuggestionsError,
  ListComposerSuggestionsResult,
  ComposerSuggestionTriggerKind,
  LoadSessionError,
  ListModelsError,
  ListModelsResult,
  RenameSessionError,
} from "@supernova/contracts/sessions/procedures";
import type {Session} from "@supernova/contracts/sessions/schemas";

export interface SessionsServiceShape {
  readonly create: (projectPath: string) => Effect.Effect<Session, CreateSessionError>;
  readonly get: (sessionId: string) => Effect.Effect<Session, LoadSessionError>;
  readonly listComposerSuggestions: (
    projectPath: string,
    kind: ComposerSuggestionTriggerKind,
    query: string
  ) => Effect.Effect<ListComposerSuggestionsResult, ListComposerSuggestionsError>;
  readonly listModels: () => Effect.Effect<ListModelsResult, ListModelsError>;
  readonly rename: (input: {readonly sessionId: string; readonly title: string}) => Effect.Effect<Session, RenameSessionError>;
}

export class SessionsService extends Context.Service<SessionsService, SessionsServiceShape>()("supernova/agent-runtime/SessionsService") {}
