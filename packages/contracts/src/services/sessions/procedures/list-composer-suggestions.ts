import {arr, lit, obj, oneOf, opt, type Static, str, union} from "@earendil-works/chord";

export const ComposerSuggestionTriggerKind = oneOf("skill", "slash");

export const ComposerSkillSuggestionItem = obj({
  id: str(),
  kind: lit("skill"),
  name: str(),
  subtitle: opt(str()),
  title: str(),
});

export const ComposerPromptTemplateSuggestionItem = obj({
  id: str(),
  kind: lit("prompt-template"),
  prompt: str(),
  subtitle: opt(str()),
  title: str(),
});

export const ComposerSuggestionItem = union([ComposerPromptTemplateSuggestionItem, ComposerSkillSuggestionItem]);

export const ListComposerSuggestionsPayload = obj({
  projectPath: str(),
});

export const ListComposerSuggestionsResult = obj({
  items: arr(ComposerSuggestionItem),
});

export type ComposerSuggestionTriggerKind = Static<typeof ComposerSuggestionTriggerKind>;
export type ComposerSkillSuggestionItem = Static<typeof ComposerSkillSuggestionItem>;
export type ComposerPromptTemplateSuggestionItem = Static<typeof ComposerPromptTemplateSuggestionItem>;
export type ComposerSuggestionItem = Static<typeof ComposerSuggestionItem>;
export type ListComposerSuggestionsPayload = Static<typeof ListComposerSuggestionsPayload>;
export type ListComposerSuggestionsResult = Static<typeof ListComposerSuggestionsResult>;
