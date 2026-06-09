import type {Ref} from "react";
import {useState} from "react";
import {useQueries} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import SearchableList from "@/features/projects/components/searchable-list";
import {listProjectSessionsQueryOptions} from "@/features/projects/hooks/api/use-list-project-sessions";
import {useProjectList} from "@/features/projects/hooks/use-project-list";
import {formatUpdatedAt} from "@/features/projects/utils/format-updated-at";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {cn} from "@/lib/cn";

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
  readonly timestamp: number;
  readonly title: string;
  readonly type: "session";
  readonly updatedAt: string;
}

type SessionSearchRow = SessionSearchProjectRow | SessionSearchResultRow;

interface SessionSearchResultProps {
  highlighted: boolean;
  onSelect: () => void;
  ref: Ref<HTMLDivElement>;
  session: SessionSearchResultRow;
}

function SessionSearchResult(props: SessionSearchResultProps) {
  const {highlighted, onSelect, ref, session} = props;

  return (
    <div className={cn("group flex items-center gap-1 rounded-xl corner-superellipse/1.3", highlighted && "bg-white/6")} onClick={onSelect} ref={ref}>
      <div className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left">
        <Icon className="shrink-0 text-neutral-500" name="session" size="sm" />
        <SessionTitleText className="min-w-0 flex-1 truncate text-[15px] text-neutral-200" title={session.title} />
        <span className="shrink-0 text-xs text-neutral-500">{session.updatedAt}</span>
      </div>
    </div>
  );
}

interface SearchSessionsDialogProps {
  onClose: () => void;
  open: boolean;
}

export default function SearchSessionsDialog(props: SearchSessionsDialogProps) {
  const {onClose, open} = props;
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const projects = useProjectList();
  const projectSessionQueries = useQueries({queries: projects.map((project) => listProjectSessionsQueryOptions(project.path))});
  const projectNamesByPath = new Map(projects.map((project) => [project.path, project.name]));
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const sessions = projectSessionQueries.flatMap((projectSessionsQuery) =>
    (projectSessionsQuery.data?.sessions ?? [])
      .map((session): SessionSearchResultRow => ({
        id: session.id,
        projectName: projectNamesByPath.get(projectSessionsQuery.data?.projectPath ?? "") ?? projectSessionsQuery.data?.projectPath ?? "Unknown project",
        projectPath: projectSessionsQuery.data?.projectPath ?? "",
        timestamp: Date.parse(session.updatedAt),
        title: session.title,
        type: "session",
        updatedAt: formatUpdatedAt(session.updatedAt),
      }))
      .filter((session) => normalizedQuery.length === 0 || session.title.toLocaleLowerCase().includes(normalizedQuery))
      .toSorted((left, right) => right.timestamp - left.timestamp)
  );
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
  };

  const handleDialogOpenChangeComplete = (nextOpen: boolean): void => {
    if (nextOpen) return;

    setActiveRowIndex(0);
    setQuery("");
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
        listStatus={sessions.length === 0 && <p className="px-3 py-2 text-sm text-neutral-600">No matching sessions.</p>}
        onActiveIndexChange={setActiveRowIndex}
        onSelect={handleOpenSession}
        renderInput={({onKeyDown}) => (
          <div className="shrink-0 pb-2 pt-4">
            <div className="flex items-center gap-2 rounded-xl bg-white/3 px-3 py-2 text-neutral-500 ring-1 ring-white/5 focus-within:text-neutral-300 focus-within:ring-white/10">
              <Icon name="search" size="sm" />
              <input
                autoFocus
                className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
                onChange={(event) => handleQueryChange(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search sessions"
                value={query}
              />
            </div>
          </div>
        )}
        renderItem={(row, _index, renderProps) =>
          row.type === "project" ? (
            <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">{row.projectName}</p>
          ) : (
            <SessionSearchResult highlighted={renderProps.highlighted} onSelect={renderProps.select} ref={renderProps.ref} session={row} />
          )
        }
        virtualized
      />
    </Dialog>
  );
}
