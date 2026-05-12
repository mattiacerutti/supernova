import {useState} from "react";
import type {MouseEvent} from "react";
import {useLocation, useNavigate} from "@tanstack/react-router";
import {useQueryClient} from "@tanstack/react-query";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuItem} from "@/components/ui/menu";
import type {ProjectListProject} from "@/features/projects/types/project-list";
import {useArchiveProjectSession} from "@/features/projects/hooks/api/use-archive-project-session";
import {useListProjectSessions} from "@/features/projects/hooks/api/use-list-project-sessions";
import {useRenameProject} from "@/features/projects/hooks/use-rename-project";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {sessionQueryOptions} from "@/features/sessions/hooks/api/use-session";
import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {formatUpdatedAt} from "@/features/projects/utils/format-updated-at";
import {cn} from "@/lib/cn";

const INITIAL_SESSION_LIMIT = 5;
const SESSION_LIMIT_INCREMENT = 5;

interface ProjectListItemProps {
  expanded: boolean;
  project: ProjectListProject;
  onToggle: (projectId: string) => void;
}

export default function ProjectListItem(props: ProjectListItemProps) {
  const {expanded, onToggle, project} = props;

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [loadedSessionLimit, setLoadedSessionLimit] = useState(INITIAL_SESSION_LIMIT);
  const [visibleSessionLimit, setVisibleSessionLimit] = useState(INITIAL_SESSION_LIMIT);
  const [confirmingArchiveSessionId, setConfirmingArchiveSessionId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const removeProject = useProjectsStore((state) => state.removeProject);
  const toggleSessionPinned = useProjectsStore((state) => state.toggleSessionPinned);
  const toggleProjectPinned = useProjectsStore((state) => state.toggleProjectPinned);
  const sessionStreams = useSessionStreamStore((state) => state.streams);
  const archiveProjectSessionMutation = useArchiveProjectSession();
  const {
    draftName,
    handleBlur: handleRenameBlur,
    handleChange: handleRenameChange,
    handleClick: handleRenameClick,
    handleFocus: handleRenameFocus,
    handleKeyDown: handleRenameKeyDown,
    handleInputRef: renameInputRef,
    renaming,
    startRenaming,
  } = useRenameProject({projectId: project.id, projectName: project.name});
  const sessionsQuery = useListProjectSessions({enabled: expanded, limit: loadedSessionLimit, projectPath: project.path});

  const sessions =
    sessionsQuery.data?.sessions
      .map((session) => ({
        id: session.id,
        pinned: project.pinnedSessionIds.includes(session.id),
        title: session.title,
        updatedAt: formatUpdatedAt(session.updatedAt),
      }))
      .toSorted((left, right) => Number(right.pinned) - Number(left.pinned)) ?? [];
  const visibleSessions = sessions.slice(0, visibleSessionLimit);

  const hasSessions = sessions.length > 0;
  const hasHiddenLoadedSessions = sessions.length > visibleSessionLimit;
  const canShowLessSessions = visibleSessionLimit > INITIAL_SESSION_LIMIT;
  const canShowMoreSessions = hasHiddenLoadedSessions || !!sessionsQuery.data?.hasMore;
  const canShowLessAtEnd = canShowLessSessions && !canShowMoreSessions;
  const canOpenInFinder = window.desktopShell?.platform === "darwin";

  const handleToggle = (): void => {
    onToggle(project.id);
  };

  const handleRemoveProject = (): void => {
    removeProject(project.id);
  };

  const handleToggleProjectPinned = (): void => {
    toggleProjectPinned(project.id);
  };

  const handleToggleSessionPinned = (event: MouseEvent<HTMLButtonElement>, sessionId: string): void => {
    event.stopPropagation();
    toggleSessionPinned(project.id, sessionId);
  };

  const handleArchiveSession = (event: MouseEvent<HTMLButtonElement>, sessionId: string): void => {
    event.stopPropagation();

    if (confirmingArchiveSessionId !== sessionId) {
      setConfirmingArchiveSessionId(sessionId);
      return;
    }

    setConfirmingArchiveSessionId(null);
    archiveProjectSessionMutation.mutate({projectPath: project.path, sessionId});
  };

  const handleOpenSession = (sessionId: string): void => {
    void navigate({params: {sessionId}, to: "/session/$sessionId"});
  };

  const handlePrefetchSession = (sessionId: string): void => {
    void queryClient.prefetchQuery(sessionQueryOptions(sessionId));
  };

  const handleNewSession = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    void navigate({search: {projectId: project.id}, to: "/session/new"});
  };

  const handleSessionMouseLeave = (sessionId: string): void => {
    if (confirmingArchiveSessionId === sessionId) setConfirmingArchiveSessionId(null);
  };

  const handleOpenInFinder = (): void => {
    void window.desktopShell?.openInFinder(project.path);
  };

  const handleLoadMoreSessions = (): void => {
    if (hasHiddenLoadedSessions) {
      setVisibleSessionLimit(sessions.length);
      return;
    }

    setLoadedSessionLimit((limit) => limit + SESSION_LIMIT_INCREMENT);
    setVisibleSessionLimit((limit) => limit + SESSION_LIMIT_INCREMENT);
  };

  const handleShowLessSessions = (): void => {
    setVisibleSessionLimit(INITIAL_SESSION_LIMIT);
  };

  return (
    <li>
      <Button
        as="div"
        className={cn("group flex w-full justify-between items-center gap-2 pl-2 pr-1 py-0.5 text-neutral-400 hover:text-neutral-300", actionsMenuOpen && "bg-white/7")}
        onClick={handleToggle}
        variant="primary"
      >
        <div className="flex min-w-0 flex-1 flex-row gap-2 items-center">
          <Icon className="text-neutral-400" name={expanded ? "folder-open" : "folder"} size="sm" />
          {renaming && (
            <input
              className="min-w-0 flex-1 truncate bg-transparent text-sm text-neutral-400 outline-none"
              onBlur={handleRenameBlur}
              onChange={handleRenameChange}
              onClick={handleRenameClick}
              onFocus={handleRenameFocus}
              onKeyDown={handleRenameKeyDown}
              ref={renameInputRef}
              value={draftName}
            />
          )}
          {!renaming && <span className="min-w-0 flex-1 truncate text-sm">{project.name}</span>}
        </div>
        <div className="flex items-center gap-0.5">
          <div className={cn("opacity-0 group-hover:opacity-100", actionsMenuOpen && "opacity-100")}>
            <Menu
              onOpenChange={setActionsMenuOpen}
              open={actionsMenuOpen}
              trigger={(triggerProps) => (
                <Button {...triggerProps} className="size-7" shape="icon" size="md" variant="ghost">
                  <Icon name="more-horizontal" size="xs" />
                </Button>
              )}
              triggerLabel={`Project actions for ${project.name}`}
              sideOffset={2}
            >
              <MenuItem icon={<Icon name="pin" size="xs" />} onClick={handleToggleProjectPinned}>
                {project.pinned ? "Unpin project" : "Pin project"}
              </MenuItem>
              {canOpenInFinder && (
                <MenuItem icon={<Icon name="folder-open" size="xs" />} onClick={handleOpenInFinder}>
                  Open in Finder
                </MenuItem>
              )}
              <MenuItem icon={<Icon name="edit" size="xs" />} onClick={startRenaming}>
                Rename project
              </MenuItem>
              <MenuItem icon={<Icon name="x" size="xs" />} onClick={handleRemoveProject}>
                Remove
              </MenuItem>
            </Menu>
          </div>
          <IconButton className="size-7" label={`New session in ${project.name}`} onClick={handleNewSession}>
            <Icon name="new-session" size="xs" />
          </IconButton>
        </div>
      </Button>

      <div
        className="grid grid-rows-[0fr] opacity-0 origin-top transition-[grid-template-rows,opacity,transform] duration-320 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
        data-expanded={expanded}
      >
        <div className="overflow-hidden py-0.5">
          {sessionsQuery.isPending && (
            <span className="ml-10 inline-flex items-center justify-start gap-2 px-0 py-1 text-sm text-neutral-600">
              Loading sessions
              <span className="size-2.5 animate-spin rounded-full border border-neutral-600 border-t-neutral-300" aria-hidden="true" />
            </span>
          )}
          {sessionsQuery.error != null && <p className="px-8 py-1 text-sm text-red-400">Unable to load sessions.</p>}
          {hasSessions && (
            <ul className="space-y-0.5">
              {visibleSessions.map((session) => {
                const confirmingArchive = confirmingArchiveSessionId === session.id;
                const sessionStream = sessionStreams[session.id];
                const sessionStreaming = sessionStream?.status === "streaming" || sessionStream?.status === "stopping";

                return (
                  <li
                    key={session.id}
                    onFocusCapture={() => handlePrefetchSession(session.id)}
                    onMouseLeave={() => handleSessionMouseLeave(session.id)}
                    onPointerDown={() => handlePrefetchSession(session.id)}
                    onPointerEnter={() => handlePrefetchSession(session.id)}
                  >
                    <Button
                      as="div"
                      className={cn(
                        "group/session flex w-full items-center gap-2 py-1.5 pl-2 pr-1 text-left",
                        location.pathname === `/session/${session.id}` && "bg-white/8 text-neutral-200"
                      )}
                      onClick={() => handleOpenSession(session.id)}
                      variant="primary"
                    >
                      <IconButton
                        className={cn("size-4 shrink-0", !session.pinned && "invisible group-hover/session:visible")}
                        label={session.pinned ? "Unpin session" : "Pin session"}
                        onClick={(event) => handleToggleSessionPinned(event, session.id)}
                      >
                        <Icon name="pin" size="xs" />
                      </IconButton>
                      <SessionTitleText className="min-w-0 flex-1 truncate text-sm" title={session.title} />
                      <span className="grid w-12 shrink-0 place-items-center justify-items-end">
                        <span className="col-start-1 row-start-1 w-full justify-self-end pr-1.5 text-right text-xs text-neutral-500 group-hover/session:invisible">
                          {sessionStreaming ? (
                            <span className="inline-block size-2 animate-spin rounded-full border border-neutral-600 border-t-neutral-300" aria-label="Session streaming" />
                          ) : (
                            session.updatedAt
                          )}
                        </span>
                        <IconButton
                          className={cn(
                            "col-start-1 row-start-1 size-5 disabled:cursor-not-allowed disabled:opacity-50",
                            confirmingArchive
                              ? "rounded-xl corner-superellipse/1.3 bg-red-500/25 text-red-500 hover:bg-red-500/35 hover:text-red-400"
                              : "invisible group-hover/session:visible"
                          )}
                          disabled={archiveProjectSessionMutation.isPending}
                          label={confirmingArchive ? "Confirm archive session" : "Archive session"}
                          onClick={(event) => handleArchiveSession(event, session.id)}
                        >
                          <Icon name={confirmingArchive ? "x" : "archive"} size="xs" />
                        </IconButton>
                      </span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {canShowMoreSessions && (
            <Button className="ml-8 inline-flex items-center justify-start gap-2 py-1 text-xs" disabled={sessionsQuery.isFetching} onClick={handleLoadMoreSessions} variant="ghost">
              Show more
              <span className="grid size-2.5 place-items-center" aria-hidden="true">
                <span
                  className={cn(
                    "size-2.5 rounded-full border border-neutral-600 border-t-neutral-300 opacity-0 transition-opacity duration-100",
                    sessionsQuery.isFetching && "animate-spin opacity-100 delay-150"
                  )}
                />
              </span>
            </Button>
          )}

          {canShowLessAtEnd && (
            <Button className="ml-8 justify-start px-0 py-1 text-xs" onClick={handleShowLessSessions} variant="ghost">
              Show less
            </Button>
          )}

          {!sessionsQuery.isPending && sessionsQuery.error == null && !hasSessions && <p className="px-8 py-1 text-sm text-neutral-600">No sessions</p>}
        </div>
      </div>
    </li>
  );
}
