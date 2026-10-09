import {useState} from "react";
import Icon from "@/components/ui/icon";
import CommandPaletteItem from "@/features/command-palette/components/command-palette-item";
import CommandPaletteList from "@/features/command-palette/components/command-palette-list";
import {buildCommandPaletteRows} from "@/features/command-palette/lib/command-palette-rows";
import type {CommandPaletteRow} from "@/features/command-palette/lib/command-palette-rows";
import {useCommandPaletteStore} from "@/features/command-palette/stores/command-palette-store";
import type {CommandPaletteAction, CommandPaletteSession, CommandPaletteSessionSearch} from "@/features/command-palette/types/command-palette";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {formatRelativeTime} from "@/lib/format-relative-time";

type RootRow = Exclude<CommandPaletteRow, {type: "header"}>;

interface CommandPaletteRootPageProps {
  readonly actions: readonly CommandPaletteAction[];
  readonly onOpenSession: (session: CommandPaletteSession) => void;
  /** The sessions matching `query`, newest first. */
  readonly useSessionSearch: (query: string) => CommandPaletteSessionSearch;
}

/** The palette's first page: actions to run and the sessions to jump to, searched together. */
export default function CommandPaletteRootPage(props: CommandPaletteRootPageProps) {
  const {actions, onOpenSession, useSessionSearch} = props;
  const [query, setQuery] = useState("");
  const closePalette = useCommandPaletteStore((state) => state.closePalette);
  const pushPage = useCommandPaletteStore((state) => state.pushPage);
  const search = useSessionSearch(query);
  const rows = buildCommandPaletteRows({actions, query, sessions: search.sessions});

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
      onQueryChange={setQuery}
      onSelect={handleSelect}
      placeholder="Search sessions and actions"
      query={query}
      renderRow={(row, itemState) =>
        row.type === "action" ? (
          <CommandPaletteItem {...itemState} detail={row.action.detail} icon={row.action.icon} trailing={row.action.kind === "page" && <Icon name="chevron-right" size="sm" />}>
            {row.action.title}
          </CommandPaletteItem>
        ) : (
          <CommandPaletteItem {...itemState} detail={row.session.projectName} icon="session" trailing={formatRelativeTime(row.session.updatedAt)}>
            <SessionTitleText title={row.session.title} />
          </CommandPaletteItem>
        )
      }
      rows={rows}
      status={rows.length === 0 && !search.isPending && <p className="px-3 py-2 text-sm text-ink-faint">No matching actions or sessions.</p>}
    />
  );
}
