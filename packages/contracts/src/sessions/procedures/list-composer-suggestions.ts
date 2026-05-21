import {Schema} from "effect";

export const ComposerSuggestionTriggerKind = Schema.Union([Schema.Literal("skill"), Schema.Literal("slash")]);

export const ComposerSkillSuggestionItem = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("skill"),
  name: Schema.String,
  subtitle: Schema.optional(Schema.String),
  title: Schema.String,
});

export const ComposerPromptTemplateSuggestionItem = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal("prompt-template"),
  prompt: Schema.String,
  subtitle: Schema.optional(Schema.String),
  title: Schema.String,
});

export const ComposerSuggestionItem = Schema.Union([ComposerPromptTemplateSuggestionItem, ComposerSkillSuggestionItem]);

export const ListComposerSuggestionsPayload = Schema.Struct({
  kind: ComposerSuggestionTriggerKind,
  projectPath: Schema.String,
  query: Schema.String,
});

export const ListComposerSuggestionsResult = Schema.Struct({
  items: Schema.Array(ComposerSuggestionItem),
  query: Schema.String,
});

export class ListComposerSuggestionsError extends Schema.TaggedErrorClass<ListComposerSuggestionsError>()("ListComposerSuggestionsError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ComposerSuggestionTriggerKind = typeof ComposerSuggestionTriggerKind.Type;
export type ComposerSkillSuggestionItem = typeof ComposerSkillSuggestionItem.Type;
export type ComposerPromptTemplateSuggestionItem = typeof ComposerPromptTemplateSuggestionItem.Type;
export type ComposerSuggestionItem = typeof ComposerSuggestionItem.Type;
export type ListComposerSuggestionsPayload = typeof ListComposerSuggestionsPayload.Type;
export type ListComposerSuggestionsResult = typeof ListComposerSuggestionsResult.Type;
