import type {ComposerSlashCommandSuggestionItem} from "@/features/sessions/types/composer-suggestion";
import type {IconName} from "@/components/ui/icon";

export type ClientSlashCommandId = "compact";

export type ClientSlashCommandActions = Partial<Record<ClientSlashCommandId, () => void>>;

interface ClientSlashCommandDefinition {
  readonly id: ClientSlashCommandId;
  readonly icon?: IconName;
  readonly subtitle?: string;
  readonly title: string;
}

const CLIENT_SLASH_COMMANDS: readonly ClientSlashCommandDefinition[] = [
  {
    icon: "compact",
    id: "compact",
    subtitle: "Summarize the conversation to reduce context size",
    title: "Compact",
  },
];

function matchesQuery(command: ClientSlashCommandDefinition, query: string): boolean {
  if (query.length === 0) return true;

  const normalizedQuery = query.toLowerCase();
  return command.id.includes(normalizedQuery) || command.title.toLowerCase().includes(normalizedQuery) || command.subtitle?.toLowerCase().includes(normalizedQuery) === true;
}

/** Builds client-owned slash command suggestions from the registered command actions. */
export function clientSlashCommandSuggestions(input: {readonly actions: ClientSlashCommandActions; readonly query: string}): readonly ComposerSlashCommandSuggestionItem[] {
  const {actions, query} = input;

  return CLIENT_SLASH_COMMANDS.flatMap((command) => {
    const action = actions[command.id];
    if (!action || !matchesQuery(command, query)) return [];

    return [
      {
        id: command.id,
        icon: command.icon,
        kind: "slash-command" as const,
        onSelect: action,
        subtitle: command.subtitle,
        title: command.title,
      },
    ];
  });
}
