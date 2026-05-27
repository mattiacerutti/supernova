import type {IconName} from "@/components/ui/icon";

export type ComposerSuggestionTriggerKind = "file" | "skill" | "slash";

export interface ComposerSuggestionMatch {
  readonly from: number;
  readonly kind: ComposerSuggestionTriggerKind;
  readonly opener: string;
  readonly query: string;
  readonly to: number;
}

export interface ComposerFileReferenceSuggestionItem {
  readonly id: string;
  readonly kind: "file";
  readonly path: string;
  readonly subtitle?: string;
  readonly title: string;
}

export interface ComposerSkillSuggestionItem {
  readonly id: string;
  readonly kind: "skill";
  readonly name: string;
  readonly subtitle?: string;
  readonly title: string;
}

export interface ComposerPromptTemplateSuggestionItem {
  readonly id: string;
  readonly kind: "prompt-template";
  readonly prompt: string;
  readonly subtitle?: string;
  readonly title: string;
}

export interface ComposerSlashCommandSuggestionItem {
  readonly icon?: IconName;
  readonly id: string;
  readonly kind: "slash-command";
  readonly onSelect: () => void;
  readonly subtitle?: string;
  readonly title: string;
}

export type ComposerSuggestionItem = ComposerFileReferenceSuggestionItem | ComposerPromptTemplateSuggestionItem | ComposerSkillSuggestionItem | ComposerSlashCommandSuggestionItem;
