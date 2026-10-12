import {z} from "zod";

export const ComposerSuggestionTriggerKind = z.union([z.literal("skill"), z.literal("slash")]);

export const ComposerSkillSuggestionItem = z.object({
  id: z.string(),
  kind: z.literal("skill"),
  name: z.string(),
  subtitle: z.string().optional(),
  title: z.string(),
});

export const ComposerPromptTemplateSuggestionItem = z.object({
  id: z.string(),
  kind: z.literal("prompt-template"),
  prompt: z.string(),
  subtitle: z.string().optional(),
  title: z.string(),
});

export const ComposerSuggestionItem = z.union([ComposerPromptTemplateSuggestionItem, ComposerSkillSuggestionItem]);

export const ListComposerSuggestionsPayload = z.object({
  projectPath: z.string(),
});

export const ListComposerSuggestionsResult = z.object({
  items: z.array(ComposerSuggestionItem),
});

export type ComposerSuggestionTriggerKind = z.infer<typeof ComposerSuggestionTriggerKind>;
export type ComposerSkillSuggestionItem = z.infer<typeof ComposerSkillSuggestionItem>;
export type ComposerPromptTemplateSuggestionItem = z.infer<typeof ComposerPromptTemplateSuggestionItem>;
export type ComposerSuggestionItem = z.infer<typeof ComposerSuggestionItem>;
export type ListComposerSuggestionsPayload = z.infer<typeof ListComposerSuggestionsPayload>;
export type ListComposerSuggestionsResult = z.infer<typeof ListComposerSuggestionsResult>;
