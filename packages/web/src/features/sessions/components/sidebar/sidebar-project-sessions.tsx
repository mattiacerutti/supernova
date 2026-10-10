import {autoAnimate} from "@formkit/auto-animate";
import {useCallback} from "react";
import Button from "@/components/ui/button";
import {useListProjectSessions} from "@/features/sessions/api/sidebar/list-project-sessions";
import SidebarSessionItem from "@/features/sessions/components/sidebar/sidebar-session-item";
import {cn} from "@/lib/cn";

interface SidebarProjectSessionsProps {
  readonly activeSessionId: string;
  /** Collapsed lists hide everything, including the active session. */
  readonly collapsed: boolean;
  readonly expanded: boolean;
  readonly projectPath: string;
}

/** The sessions of one project in the sidebar, a page at a time. Collapsed projects still show the session that is open. */
export default function SidebarProjectSessions(props: SidebarProjectSessionsProps) {
  const {activeSessionId, collapsed, expanded, projectPath} = props;
  const listing = useListProjectSessions(projectPath);
  const sessions = listing.sessions ?? [];

  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const displayedSessions = expanded ? sessions : activeSession && !collapsed ? [activeSession] : [];
  const showsAnything = displayedSessions.length > 0;

  // Keep one observer per list, including Strict Mode's setup/cleanup replay.
  const attachAutoAnimate = useCallback((node: HTMLUListElement | null) => {
    if (!node) return;
    const controller = autoAnimate(node, {duration: 180, easing: "ease-out"});
    return controller.destroy;
  }, []);

  return (
    <div className={cn("overflow-hidden", showsAnything && "py-0.5")} onPointerDown={(event) => event.stopPropagation()}>
      <ul className="flex flex-col gap-0.5" ref={attachAutoAnimate}>
        {expanded && listing.isPending && (
          <li className="ml-10 inline-flex items-center justify-start gap-2 px-0 py-1 text-sm text-ink-faint">
            Loading sessions
            <span className="size-2.5 animate-spin rounded-full border border-border-strong border-t-ink" aria-hidden="true" />
          </li>
        )}
        {expanded && listing.error != null && <li className="px-8 py-1 text-sm text-danger-ink">Unable to load sessions.</li>}
        {displayedSessions.map((session) => (
          <SidebarSessionItem key={session.id} projectPath={projectPath} session={session} />
        ))}
        {expanded && listing.hasMore && (
          <li>
            <Button className="ml-8 inline-flex items-center justify-start gap-2 py-1 text-xs" disabled={listing.isLoadingMore} onClick={listing.loadMore} variant="ghost">
              {listing.isLoadingMore ? "Loading" : "Show more"}
            </Button>
          </li>
        )}
        {expanded && !listing.hasMore && listing.canShowLess && (
          <li>
            <Button className="ml-8 justify-start px-0 py-1 text-xs" onClick={listing.showFirstPage} variant="ghost">
              Show less
            </Button>
          </li>
        )}
        {expanded && !listing.isPending && listing.error == null && sessions.length === 0 && <li className="px-8 py-1 text-sm text-ink-faint">No sessions</li>}
      </ul>
    </div>
  );
}
