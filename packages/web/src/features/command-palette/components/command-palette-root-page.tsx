import {useRef, useState} from "react";
import Icon from "@/components/ui/icon";
import CommandPaletteItem from "@/features/command-palette/components/command-palette-item";
import type {CommandPaletteItemState} from "@/features/command-palette/components/command-palette-item";
import CommandPaletteList from "@/features/command-palette/components/command-palette-list";
import {buildCommandPaletteRows} from "@/features/command-palette/lib/command-palette-rows";
import type {CommandPaletteRow} from "@/features/command-palette/lib/command-palette-rows";
import {useCommandPaletteStore} from "@/features/command-palette/stores/command-palette-store";
import type {CommandPaletteAction, CommandPaletteSession, CommandPaletteSessionSearch} from "@/features/command-palette/types/command-palette";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {useRelativeTime} from "@/hooks/use-relative-time";

type RootRow = Exclude<CommandPaletteRow, {type: "header"}>;

const SESSION_SEARCH_DELAY_MS = 100;

interface CommandPaletteRootPageProps {
  readonly actions: readonly CommandPaletteAction[];
  readonly onOpenSession: (session: CommandPaletteSession) => void;
  readonly useSessionSearch: (query: string) => CommandPaletteSessionSearch;
}

export default function CommandPaletteRootPage(props: CommandPaletteRootPageProps) {
  const {actions, onOpenSession, useSessionSearch} = props;
  const [query, setQuery] = useState("");
  const [sessionQuery, setSessionQuery] = useState("");
  const [showingNoMatches, setShowingNoMatches] = useState(false);
  const sessionQueryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const closePalette = useCommandPaletteStore((state) => state.closePalette);
  const pushPage = useCommandPaletteStore((state) => state.pushPage);
  const search = useSessionSearch(sessionQuery);

  const handleQueryChange = (value: string): void => {
    setQuery(value);
    clearTimeout(sessionQueryTimer.current);
    // Clearing the query shows recent sessions at once; anything else waits for typing to pause.
    if (value.trim().length === 0) setSessionQuery("");
    else sessionQueryTimer.current = setTimeout(() => setSessionQuery(value.trim()), SESSION_SEARCH_DELAY_MS);
  };
  const rows = buildCommandPaletteRows({actions, query, sessions: search.sessions});
  // "No matches" waits for the search of the query on screen, so it never flashes before results arrive.
  // Once shown, it stays while the next query is searched and nothing matches locally, so typing on doesn't blink it.
  const searchSettled = !search.isPending && sessionQuery === query.trim();
  const noMatches = rows.length === 0 && (searchSettled || showingNoMatches);
  if (noMatches !== showingNoMatches) setShowingNoMatches(noMatches);

  const handleSelect = (row: RootRow): void => {
    if (row.type === "session") {
      closePalette();
      onOpenSession(row.session);
      return;
    }

    const {action} = row;
    if (action.kind === "page") {
      pushPage(action.page);
      return;
    }

    closePalette();
    action.run();
  };

  return (
    <CommandPaletteList
      getRowKey={(row: RootRow) => (row.type === "action" ? `action-${row.action.id}` : `session-${row.session.id}`)}
      hints={[{hotkeys: ["Enter"], label: "Select"}]}
      onEndReached={search.loadMore}
      onQueryChange={handleQueryChange}
      onSelect={handleSelect}
      placeholder="Search sessions and actions"
      query={query}
      renderRow={(row, itemState) =>
        row.type === "action" ? (
          <CommandPaletteItem {...itemState} detail={row.action.detail} icon={row.action.icon} trailing={row.action.kind === "page" && <Icon name="chevron-right" size="sm" />}>
            {row.action.title}
          </CommandPaletteItem>
        ) : (
          <SessionRow itemState={itemState} session={row.session} />
        )
      }
      rows={rows}
      status={noMatches && <p className="px-3 py-2 text-sm text-ink-faint">No matching actions or sessions.</p>}
    />
  );
}

interface SessionRowProps {
  readonly itemState: CommandPaletteItemState;
  readonly session: CommandPaletteSession;
}

function SessionRow(props: SessionRowProps) {
  const {itemState, session} = props;
  const relativeTime = useRelativeTime(session.updatedAt);
  return (
    <CommandPaletteItem {...itemState} detail={session.projectName} icon="session" trailing={relativeTime}>
      <SessionTitleText title={session.title} />
    </CommandPaletteItem>
  );
}
