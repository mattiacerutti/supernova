import {Schema} from "effect";

export const SessionComposerSuggestionTriggerKind = Schema.Union([Schema.Literal("skill"), Schema.Literal("slash")]);

export const SessionComposerSkillSuggestionItem = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("skill"),
  name: Schema.String,
  subtitle: Schema.optional(Schema.String),
  title: Schema.String,
});

export const SessionComposerPromptTemplateSuggestionItem = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("prompt-template"),
  prompt: Schema.String,
  subtitle: Schema.optional(Schema.String),
  title: Schema.String,
});

export const SessionComposerSuggestionItem = Schema.Union([SessionComposerPromptTemplateSuggestionItem, SessionComposerSkillSuggestionItem]);

export const SessionComposerSuggestionsListPayload = Schema.Struct({
  kind: SessionComposerSuggestionTriggerKind,
  projectPath: Schema.String,
  query: Schema.String,
});

export const SessionComposerSuggestionsListResult = Schema.Struct({
  items: Schema.Array(SessionComposerSuggestionItem),
  query: Schema.String,
});

export class SessionComposerSuggestionsListError extends Schema.TaggedErrorClass<SessionComposerSuggestionsListError>()("SessionComposerSuggestionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type SessionComposerSuggestionTriggerKind = typeof SessionComposerSuggestionTriggerKind.Type;
export type SessionComposerSkillSuggestionItem = typeof SessionComposerSkillSuggestionItem.Type;
export type SessionComposerPromptTemplateSuggestionItem = typeof SessionComposerPromptTemplateSuggestionItem.Type;
export type SessionComposerSuggestionItem = typeof SessionComposerSuggestionItem.Type;
export type SessionComposerSuggestionsListPayload = typeof SessionComposerSuggestionsListPayload.Type;
export type SessionComposerSuggestionsListResult = typeof SessionComposerSuggestionsListResult.Type;
