import {autoAnimate} from "@formkit/auto-animate";
import {useCallback, useState} from "react";
import Button from "@/components/ui/button";
import {useListProjectSessions} from "@/features/sessions/api/sidebar/list-project-sessions";
import SidebarSessionItem from "@/features/sessions/components/sidebar/sidebar-session-item";
import {useSessionPinsStore} from "@/features/sessions/stores/sidebar/session-pins-store";
import {cn} from "@/lib/cn";

const INITIAL_SESSION_LIMIT = 5;
const SESSION_LIMIT_INCREMENT = 5;

interface SidebarProjectSessionsProps {
  readonly activeSessionId: string;
  /** Collapsed lists hide everything, including the active session. */
  readonly collapsed: boolean;
  readonly expanded: boolean;
  readonly projectPath: string;
}

/** The sessions of one project in the sidebar. Collapsed projects still show the session that is open. */
export default function SidebarProjectSessions(props: SidebarProjectSessionsProps) {
  const {activeSessionId, collapsed, expanded, projectPath} = props;
  const pinnedSessionIds = useSessionPinsStore((state) => state.pinnedSessionIds);
  const [visibleSessionLimit, setVisibleSessionLimit] = useState(INITIAL_SESSION_LIMIT);
  const sessionsQuery = useListProjectSessions(projectPath);

  const sessions = (sessionsQuery.data?.sessions ?? [])
    .map((session) => ({...session, pinned: pinnedSessionIds.includes(session.id), timestamp: Date.parse(session.updatedAt)}))
    .toSorted((left, right) => Number(right.pinned) - Number(left.pinned) || right.timestamp - left.timestamp);

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const pinnedSessions = sessions.filter((session) => session.pinned);
  const unpinnedSessions = sessions.filter((session) => !session.pinned);
  const visibleSessionIds = new Set([...pinnedSessions, ...unpinnedSessions.slice(0, visibleSessionLimit), ...(activeSession ? [activeSession] : [])].map((session) => session.id));
  const visibleSessions = sessions.filter((session) => visibleSessionIds.has(session.id));
  const displayedSessions = expanded ? visibleSessions : activeSession && !collapsed ? [activeSession] : [];
  const showsAnything = displayedSessions.length > 0;

  const hasHiddenSessions = unpinnedSessions.some((session) => !visibleSessionIds.has(session.id));
  const canShowMore = expanded && hasHiddenSessions;
  const canShowLess = expanded && visibleSessionLimit > INITIAL_SESSION_LIMIT && !canShowMore;

  const handleShowMore = (): void => {
    setVisibleSessionLimit((limit) => limit + SESSION_LIMIT_INCREMENT);
  };

  const handleShowLess = (): void => {
    setVisibleSessionLimit(INITIAL_SESSION_LIMIT);
  };

  // Keep one observer per list, including Strict Mode's setup/cleanup replay.
  const attachAutoAnimate = useCallback((node: HTMLUListElement | null) => {
    if (!node) return;
    const controller = autoAnimate(node, {duration: 180, easing: "ease-out"});
    return controller.destroy;
  }, []);

  return (
    <div className={cn("overflow-hidden", showsAnything && "py-0.5")} onPointerDown={(event) => event.stopPropagation()}>
      <ul className="flex flex-col gap-0.5" ref={attachAutoAnimate}>
        {expanded && sessionsQuery.isPending && (
          <li className="ml-10 inline-flex items-center justify-start gap-2 px-0 py-1 text-sm text-ink-faint">
            Loading sessions
            <span className="size-2.5 animate-spin rounded-full border border-border-strong border-t-ink" aria-hidden="true" />
          </li>
        )}
        {expanded && sessionsQuery.error != null && <li className="px-8 py-1 text-sm text-danger-ink">Unable to load sessions.</li>}
        {displayedSessions.map((session) => (
          <SidebarSessionItem
            forked={session.forked}
            key={session.id}
            projectPath={projectPath}
            sessionId={session.id}
            title={session.title}
            updatedAt={session.updatedAt}
            worktree={session.worktree}
          />
        ))}
        {canShowMore && (
          <li>
            <Button className="ml-8 inline-flex items-center justify-start gap-2 py-1 text-xs" onClick={handleShowMore} variant="ghost">
              Show more
            </Button>
          </li>
        )}
        {canShowLess && (
          <li>
            <Button className="ml-8 justify-start px-0 py-1 text-xs" onClick={handleShowLess} variant="ghost">
              Show less
            </Button>
          </li>
        )}
        {expanded && sessionsQuery.isSuccess && sessions.length === 0 && <li className="px-8 py-1 text-sm text-ink-faint">No sessions</li>}
      </ul>
    </div>
  );
}
