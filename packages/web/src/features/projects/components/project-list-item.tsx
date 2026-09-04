import {useCallback, useRef, useState} from "react";
import type {MouseEvent} from "react";
import {useLocation, useNavigate} from "@tanstack/react-router";
import {useQueryClient} from "@tanstack/react-query";
import {autoAnimate} from "@formkit/auto-animate";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuItem} from "@/components/ui/menu";
import type {ProjectListProject} from "@/features/projects/types/project-list";
import {useArchiveProjectSession} from "@/features/projects/hooks/api/use-archive-project-session";
import {useListProjectSessions} from "@/features/projects/hooks/api/use-list-project-sessions";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {sessionQueryOptions} from "@/features/sessions/hooks/api/use-session";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/session-visits-store";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {formatUpdatedAt} from "@/features/projects/utils/format-updated-at";
import {cn} from "@/lib/cn";

const INITIAL_SESSION_LIMIT = 5;
const SESSION_LIMIT_INCREMENT = 5;

interface ProjectListItemProps {
  activeSessionId: string;
  dragging: boolean;
  expanded: boolean;
  project: ProjectListProject;
  onToggle: (projectId: string) => void;
}

export default function ProjectListItem(props: ProjectListItemProps) {
  const {activeSessionId, dragging, expanded, onToggle, project} = props;

  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [visibleSessionLimit, setVisibleSessionLimit] = useState(INITIAL_SESSION_LIMIT);
  const [confirmingArchiveSessionId, setConfirmingArchiveSessionId] = useState<string | null>(null);
  const animatedSessionListsRef = useRef(new WeakSet<HTMLElement>());
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const removeProject = useProjectsStore((state) => state.removeProject);
  const renameProject = useProjectsStore((state) => state.renameProject);
  const toggleSessionPinned = useProjectsStore((state) => state.toggleSessionPinned);
  const toggleProjectPinned = useProjectsStore((state) => state.toggleProjectPinned);
  const sessionLiveStates = useSessionLiveStore((state) => state.sessions);
  const sessionVisits = useSessionVisitsStore((state) => state.visits);
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
  } = useInlineRename({initialValue: project.name, onSave: (name) => renameProject(project.id, name)});
  const sessionsQuery = useListProjectSessions({projectPath: project.path});

  const sessions =
    sessionsQuery.data?.sessions
      .map((session) => ({
        id: session.id,
        pinned: project.pinnedSessionIds.includes(session.id),
        title: session.title,
        timestamp: Date.parse(session.updatedAt),
        updatedAt: formatUpdatedAt(session.updatedAt),
      }))
      .toSorted((left, right) => Number(right.pinned) - Number(left.pinned) || right.timestamp - left.timestamp) ?? [];

  const activeSession = sessions.find((session) => session.id === activeSessionId);

  const pinnedSessions = sessions.filter((session) => session.pinned);
  const unpinnedSessions = sessions.filter((session) => !session.pinned);
  const visibleSessionIds = new Set([...pinnedSessions, ...unpinnedSessions.slice(0, visibleSessionLimit), ...(activeSession ? [activeSession] : [])].map((session) => session.id));
  const visibleSessions = sessions.filter((session) => visibleSessionIds.has(session.id));
  const displayedSessions = expanded ? visibleSessions : activeSession && !dragging ? [activeSession] : [];
  const sessionsExpanded = expanded || (activeSession != null && !dragging);

  const hasSessions = sessions.length > 0;
  const hasHiddenSessions = unpinnedSessions.some((session) => !visibleSessionIds.has(session.id));
  const canShowLessSessions = visibleSessionLimit > INITIAL_SESSION_LIMIT;
  const canShowMoreSessions = expanded && hasHiddenSessions;
  const canShowLessAtEnd = expanded && canShowLessSessions && !canShowMoreSessions;
  const canOpenInFinder = window.desktopApi?.environment === "mac";

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
    archiveProjectSessionMutation.mutate(
      {projectPath: project.path, sessionId},
      {
        onSuccess: () => {
          if (location.pathname === `/session/${sessionId}`) {
            void navigate({replace: true, search: {projectId: project.id}, to: "/session/new"});
          }
        },
      }
    );
  };

  const handleOpenSession = (sessionId: string): void => {
    void navigate({params: {sessionId}, to: "/session/$sessionId"});
  };

  const handlePrefetchSession = (sessionId: string): void => {
    if (sessionId === activeSessionId) return;

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
    void window.desktopApi?.openDirectory(project.path);
  };

  const handleLoadMoreSessions = (): void => {
    setVisibleSessionLimit((limit) => limit + SESSION_LIMIT_INCREMENT);
  };

  const handleShowLessSessions = (): void => {
    setVisibleSessionLimit(INITIAL_SESSION_LIMIT);
  };

  const attachSessionListAutoAnimateRef = useCallback((node: HTMLElement | null): void => {
    if (!node || animatedSessionListsRef.current.has(node)) return;
    autoAnimate(node, {
      duration: 180,
      easing: "ease-out",
    });
    animatedSessionListsRef.current.add(node);
  }, []);

  return (
    <>
      <Button
        as="div"
        className={cn("group flex w-full justify-between items-center gap-2 pl-2 pr-1 py-0.5 text-ink-muted hover:text-ink", actionsMenuOpen && "bg-overlay-hover")}
        onClick={handleToggle}
        variant="primary"
      >
        <div className="flex min-w-0 flex-1 flex-row gap-2 items-center">
          <Icon className="text-ink-muted" name={expanded ? "folder-open" : "folder"} size="sm" />
          {renaming && (
            <input
              className="min-w-0 flex-1 truncate bg-transparent text-sm text-ink-muted outline-none"
              onBlur={handleRenameBlur}
              onChange={handleRenameChange}
              onClick={handleRenameClick}
              onFocus={handleRenameFocus}
              onKeyDown={handleRenameKeyDown}
              onPointerDown={(event) => event.stopPropagation()}
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

      <div className={cn("overflow-hidden", sessionsExpanded && "py-0.5")} onPointerDown={(event) => event.stopPropagation()}>
        <ul className="flex flex-col gap-0.5" ref={attachSessionListAutoAnimateRef}>
          {expanded && sessionsQuery.isPending && (
            <li className="ml-10 inline-flex items-center justify-start gap-2 px-0 py-1 text-sm text-ink-faint">
              Loading sessions
              <span className="size-2.5 animate-spin rounded-full border border-border-strong border-t-ink" aria-hidden="true" />
            </li>
          )}
          {expanded && sessionsQuery.error != null && <li className="px-8 py-1 text-sm text-danger-ink">Unable to load sessions.</li>}
          {displayedSessions.map((session) => {
            const confirmingArchive = confirmingArchiveSessionId === session.id;
            const selected = location.pathname === `/session/${session.id}`;
            const sessionLive = sessionLiveStates[session.id];
            const sessionStreaming = sessionLive?.status === "streaming" || sessionLive?.status === "stopping" || sessionLive?.status === "compacting";
            const sessionUnseen = !sessionStreaming && hasUnseenActivity({activityAtMs: session.timestamp, visitedAt: sessionVisits[session.id]});

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
                  className={cn("group/session flex w-full items-center gap-2 py-1.5 pl-2 pr-1 text-left", selected && "bg-overlay-pressed text-ink")}
                  onClick={() => handleOpenSession(session.id)}
                  variant="primary"
                >
                  <IconButton
                    className={cn("group/pin-toggle size-4 shrink-0", !session.pinned && "invisible group-hover/session:visible")}
                    label={session.pinned ? "Unpin session" : "Pin session"}
                    onClick={(event) => handleToggleSessionPinned(event, session.id)}
                  >
                    <Icon
                      className="origin-center transition-transform duration-250 ease-[cubic-bezier(0.2,0.9,0.2,1.15)] group-active/pin-toggle:scale-85 group-active/pin-toggle:-rotate-8 motion-reduce:transition-none"
                      name="pin"
                      size="xs"
                    />
                  </IconButton>
                  <SessionTitleText className="min-w-0 flex-1 truncate text-sm" title={session.title} />
                  <span className="grid w-12 shrink-0 place-items-center justify-items-end">
                    <span className="col-start-1 row-start-1 w-full justify-self-end whitespace-nowrap pr-1.5 text-right text-xs text-ink-muted group-hover/session:invisible">
                      {sessionStreaming ? (
                        <span className="inline-block size-2 animate-spin rounded-full border border-border-strong border-t-ink" aria-label="Session streaming" />
                      ) : sessionUnseen ? (
                        <span className="inline-block size-1.5 rounded-full bg-accent" aria-label="Finished while closed" role="status" />
                      ) : (
                        session.updatedAt
                      )}
                    </span>
                    <IconButton
                      className={cn(
                        "col-start-1 row-start-1 size-5 disabled:cursor-not-allowed disabled:opacity-50",
                        confirmingArchive
                          ? "rounded-xl corner-superellipse/1.3 bg-diff-removed-surface text-danger-ink hover:bg-diff-removed-surface hover:text-danger-ink"
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

          {canShowMoreSessions && (
            <li>
              <Button className="ml-8 inline-flex items-center justify-start gap-2 py-1 text-xs" onClick={handleLoadMoreSessions} variant="ghost">
                Show more
              </Button>
            </li>
          )}

          {canShowLessAtEnd && (
            <li>
              <Button className="ml-8 justify-start px-0 py-1 text-xs" onClick={handleShowLessSessions} variant="ghost">
                Show less
              </Button>
            </li>
          )}

          {expanded && !sessionsQuery.isPending && sessionsQuery.error == null && !hasSessions && <li className="px-8 py-1 text-sm text-ink-faint">No sessions</li>}
        </ul>
      </div>
    </>
  );
}
