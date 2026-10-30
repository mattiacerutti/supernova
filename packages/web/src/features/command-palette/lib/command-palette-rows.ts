import {matchSorter} from "match-sorter";
import type {CommandPaletteAction, CommandPaletteHeaderRow, CommandPaletteSession} from "@/features/command-palette/types/command-palette";

export type CommandPaletteRow<TSession = CommandPaletteSession> =
  | CommandPaletteHeaderRow
  | {readonly type: "action"; readonly action: CommandPaletteAction}
  | {readonly type: "session"; readonly session: TSession};

interface BuildCommandPaletteRowsInput<TSession extends {readonly title: string}> {
  readonly actions: readonly CommandPaletteAction[];
  readonly query: string;
  readonly sessions: readonly TSession[];
}

/**
 * Sessions come last so a page of them loaded later only appends.
 * Sessions are filtered again by the current query because the last search's results stay up while the next one runs.
 * Matching a case-insensitive title substring, like the server search, only drops sessions the next results would drop too.
 */
export function buildCommandPaletteRows<TSession extends {readonly title: string}>(input: BuildCommandPaletteRowsInput<TSession>): CommandPaletteRow<TSession>[] {
  const {actions, query} = input;
  const trimmedQuery = query.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  const sessions = input.sessions.filter((session) => session.title.toLowerCase().includes(lowerQuery));
  const matchedActions = trimmedQuery.length === 0 ? actions : matchSorter(actions, trimmedQuery, {keys: ["title", (action) => [...(action.keywords ?? [])]]});
  const sections = [...new Set(actions.map((action) => action.section))];

  const actionRows = sections.flatMap((section): CommandPaletteRow<TSession>[] => {
    const sectionActions = matchedActions.filter((action) => action.section === section);
    if (sectionActions.length === 0) return [];
    return [{id: `section-${section}`, title: section, type: "header"}, ...sectionActions.map((action) => ({action, type: "action" as const}))];
  });
  const sessionRows: CommandPaletteRow<TSession>[] =
    sessions.length === 0
      ? []
      : [
          {id: "section-sessions", title: trimmedQuery.length === 0 ? "Recent sessions" : "Sessions", type: "header"},
          ...sessions.map((session) => ({session, type: "session" as const})),
        ];

  return [...actionRows, ...sessionRows];
}
