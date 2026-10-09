import {matchSorter} from "match-sorter";
import type {CommandPaletteAction, CommandPaletteHeaderRow, CommandPaletteSession} from "@/features/command-palette/types/command-palette";

/** A row of the root page: a section heading, an action, or a session. */
export type CommandPaletteRow<TSession = CommandPaletteSession> =
  | CommandPaletteHeaderRow
  | {readonly type: "action"; readonly action: CommandPaletteAction}
  | {readonly type: "session"; readonly session: TSession};

interface BuildCommandPaletteRowsInput<TSession> {
  readonly actions: readonly CommandPaletteAction[];
  readonly query: string;
  /** Sessions already matched against the query, in the order to show them. */
  readonly sessions: readonly TSession[];
}

/**
 * The root list: matching actions under their section headings, then sessions. Sessions come last so a page of them
 * loaded later only ever appends.
 */
export function buildCommandPaletteRows<TSession>(input: BuildCommandPaletteRowsInput<TSession>): CommandPaletteRow<TSession>[] {
  const {actions, query, sessions} = input;
  const trimmedQuery = query.trim();
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
