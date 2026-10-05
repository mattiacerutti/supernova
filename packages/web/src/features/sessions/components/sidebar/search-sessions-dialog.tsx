import type {Ref} from "react";
import {useRef, useState} from "react";
import {useNavigate} from "@tanstack/react-router";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import {MenuLabel} from "@/components/ui/menu";
import SearchField from "@/components/ui/search-field";
import SearchableList from "@/components/searchable-list";
import {useSearchSessions} from "@/features/sessions/api/sidebar/search-sessions";
import type {Project} from "@/features/projects/types/project";
import {formatRelativeTime} from "@/lib/format-relative-time";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {cn} from "@/lib/cn";

/** How long typing pauses before the query is sent. */
const SEARCH_DELAY_MS = 150;

interface SessionSearchProjectRow {
  readonly id: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly type: "project";
}

interface SessionSearchResultRow {
  readonly id: string;
  readonly projectName: string;
  readonly projectPath: string;
  readonly title: string;
  readonly type: "session";
  readonly updatedAt: string;
}

type SessionSearchRow = SessionSearchProjectRow | SessionSearchResultRow;

interface SessionSearchResultProps {
  readonly highlighted: boolean;
  readonly onSelect: () => void;
  readonly ref: Ref<HTMLDivElement>;
  readonly session: SessionSearchResultRow;
}

function SessionSearchResult(props: SessionSearchResultProps) {
  const {highlighted, onSelect, ref, session} = props;

  return (
    <div className={cn("group flex items-center gap-1 rounded-xl corner-superellipse/1.3", highlighted && "bg-overlay-hover")} onClick={onSelect} ref={ref}>
      <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left">
        <Icon className="shrink-0 text-ink-muted" name="session" size="sm" />
        <SessionTitleText className="min-w-0 flex-1 truncate text-[15px] text-ink" title={session.title} />
        <span className="shrink-0 text-xs text-ink-muted">{session.updatedAt}</span>
      </div>
    </div>
  );
}

interface SearchSessionsDialogProps {
  readonly onClose: () => void;
  readonly open: boolean;
  readonly projects: readonly Project[];
}

export default function SearchSessionsDialog(props: SearchSessionsDialogProps) {
  const {onClose, open, projects} = props;
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [query, setQuery] = useState("");
  // What the server is asked for: the query once typing pauses.
  const [searchedQuery, setSearchedQuery] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const navigate = useNavigate();
  const search = useSearchSessions(
    searchedQuery,
    projects.map((project) => project.path)
  );
  const projectNamesByPath = new Map(projects.map((project) => [project.path, project.name]));
  const sessions = search.sessions.map(
    (session): SessionSearchResultRow => ({
      id: session.id,
      projectName: projectNamesByPath.get(session.projectPath) ?? session.projectPath,
      projectPath: session.projectPath,
      title: session.title,
      type: "session",
      updatedAt: formatRelativeTime(session.updatedAt),
    })
  );
  // TODO(search-grouping): results arrive newest first across projects, so a project's header repeats whenever
  // activity alternates between projects. Decide how to present them: group loaded results per project (a later page
  // can insert rows above the scroll position), one paged search per project (a request per project per query), or
  // no headers and the project on each row, as t3code and opencode do.
  const rows = sessions.reduce<SessionSearchRow[]>((result, session) => {
    if (session.projectPath !== result.at(-1)?.projectPath) {
      result.push({id: `project-${session.projectPath}`, projectName: session.projectName, projectPath: session.projectPath, type: "project"});
    }

    result.push(session);
    return result;
  }, []);

  const handleDialogOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) onClose();
  };

  const handleQueryChange = (value: string): void => {
    setQuery(value);
    setActiveRowIndex(0);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearchedQuery(value.trim()), SEARCH_DELAY_MS);
  };

  const handleDialogOpenChangeComplete = (nextOpen: boolean): void => {
    if (nextOpen) return;

    setActiveRowIndex(0);
    setQuery("");
    clearTimeout(searchTimer.current);
    setSearchedQuery("");
  };

  const handleOpenSession = (row: SessionSearchRow): void => {
    if (row.type !== "session") return;

    onClose();
    void navigate({params: {sessionId: row.id}, to: "/session/$sessionId"});
  };

  return (
    <Dialog onOpenChange={handleDialogOpenChange} onOpenChangeComplete={handleDialogOpenChangeComplete} open={open} title="Search sessions">
      <SearchableList
        activeIndex={activeRowIndex}
        estimateSize={(index) => (rows[index]?.type === "project" ? 28 : 40)}
        getItemKey={(row) => `${row.type}-${row.projectPath}-${row.id}`}
        isItemSelectable={(row) => row.type === "session"}
        items={rows}
        listStatus={!search.isPending && sessions.length === 0 && <p className="px-3 py-2 text-sm text-ink-faint">No matching sessions.</p>}
        onActiveIndexChange={setActiveRowIndex}
        onEndReached={search.loadMore}
        onSelect={handleOpenSession}
        className="pt-1"
        renderInput={({onKeyDown}) => (
          <SearchField
            autoFocus
            className="-mx-5 mt-3 px-5"
            onChange={(event) => handleQueryChange(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search sessions"
            value={query}
          />
        )}
        renderItem={(row, _index, renderProps) =>
          row.type === "project" ? (
            <MenuLabel className="pb-1 text-xs">{row.projectName}</MenuLabel>
          ) : (
            <SessionSearchResult highlighted={renderProps.highlighted} onSelect={renderProps.select} ref={renderProps.ref} session={row} />
          )
        }
        virtualized
      />
    </Dialog>
  );
}
