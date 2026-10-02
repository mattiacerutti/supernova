import {z} from "zod";
import {array, struct, TaggedError} from "@supernova/contracts/runtime/schemas";

export const ComposerSuggestionTriggerKind = z.union([z.literal("skill"), z.literal("slash")]);

export const ComposerSkillSuggestionItem = struct({
  id: z.string(),
  kind: z.literal("skill"),
  name: z.string(),
  subtitle: z.string().optional(),
  title: z.string(),
});

export const ComposerPromptTemplateSuggestionItem = struct({
  id: z.string(),
  kind: z.literal("prompt-template"),
  prompt: z.string(),
  subtitle: z.string().optional(),
  title: z.string(),
});

export const ComposerSuggestionItem = z.union([ComposerPromptTemplateSuggestionItem, ComposerSkillSuggestionItem]);

export const ListComposerSuggestionsPayload = struct({
  projectPath: z.string(),
});

export const ListComposerSuggestionsResult = struct({
  items: array(ComposerSuggestionItem),
});

export class ListComposerSuggestionsError extends TaggedError("ListComposerSuggestionsError") {}

export type ComposerSuggestionTriggerKind = z.infer<typeof ComposerSuggestionTriggerKind>;
export type ComposerSkillSuggestionItem = z.infer<typeof ComposerSkillSuggestionItem>;
export type ComposerPromptTemplateSuggestionItem = z.infer<typeof ComposerPromptTemplateSuggestionItem>;
export type ComposerSuggestionItem = z.infer<typeof ComposerSuggestionItem>;
export type ListComposerSuggestionsPayload = z.infer<typeof ListComposerSuggestionsPayload>;
export type ListComposerSuggestionsResult = z.infer<typeof ListComposerSuggestionsResult>;
