import {useQueryClient} from "@tanstack/react-query";
import {useLocation, useNavigate} from "@tanstack/react-router";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {getSessionQueryOptions} from "@/features/sessions/api/conversation/get-session";
import {useRenameSession} from "@/features/sessions/api/sidebar/rename-session";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {useSessionPinsStore} from "@/features/sessions/stores/sidebar/session-pins-store";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {cn} from "@/lib/cn";
import {formatRelativeTime} from "@/lib/format-relative-time";

interface SidebarSessionItemProps {
  readonly forked: boolean;
  readonly projectPath: string;
  readonly sessionId: string;
  readonly title: string;
  readonly updatedAt: string;
}

/** One session row in the sidebar: opens on click, prefetches on hover, and owns rename, pin, live, and unseen state. */
export default function SidebarSessionItem(props: SidebarSessionItemProps) {
  const {forked, projectPath, sessionId, title, updatedAt} = props;
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const renameSession = useRenameSession();
  const liveStatus = useSessionLiveStore((state) => state.sessions[sessionId]?.status);
  const pinned = useSessionPinsStore((state) => state.pinnedSessionIds.includes(sessionId));
  const visitedAt = useSessionVisitsStore((state) => state.visits[sessionId]);
  const {inputProps, renaming, startRenaming} = useInlineRename({initialValue: title, onSave: (nextTitle) => renameSession.mutate({sessionId, title: nextTitle})});

  const selected = location.pathname === `/session/${sessionId}`;
  const streaming = liveStatus === "streaming" || liveStatus === "stopping" || liveStatus === "compacting";
  const unseen = !streaming && hasUnseenActivity({activityAtMs: Date.parse(updatedAt), visitedAt});

  const handleOpen = (): void => {
    void navigate({params: {sessionId}, to: "/session/$sessionId"});
  };

  const handlePrefetch = (): void => {
    if (selected) return;
    void queryClient.prefetchQuery(getSessionQueryOptions(sessionId));
  };

  return (
    <li onFocusCapture={handlePrefetch} onPointerDown={handlePrefetch} onPointerEnter={handlePrefetch}>
      <Button
        as="div"
        className={cn("group/session flex w-full items-center gap-2 py-1.5 pl-2 pr-2 text-left", selected && "bg-overlay-pressed text-ink")}
        onClick={handleOpen}
        variant="primary"
      >
        <span className="grid size-4 shrink-0 place-items-center">
          {forked ? (
            <Icon aria-label="Forked session" className="text-ink-faint" name="git-branch" role="img" size="xs" />
          ) : (
            pinned && <Icon aria-label="Pinned session" className="text-ink-muted" name="pin" role="img" size="xs" />
          )}
        </span>
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {renaming ? (
            <input {...inputProps} aria-label="Session title" className="min-w-0 flex-1 truncate bg-transparent text-sm outline-none" />
          ) : (
            <SessionTitleText
              className="no-scrollbar scroll-fade-x min-w-0 flex-1 overflow-x-auto overflow-y-hidden text-sm whitespace-nowrap [--scroll-fade-e-size:1.5rem] [--scroll-fade-reveal:0.5rem] [--scroll-fade-s-size:1rem]"
              revealOnHover
              title={title}
            />
          )}
        </div>
        <span className="grid w-12 shrink-0 place-items-center justify-items-end">
          <span className="col-start-1 row-start-1 w-full justify-self-end whitespace-nowrap pr-0.75 text-right text-xs text-ink-muted group-hover/session:invisible group-focus-within/session:invisible group-has-[[data-popup-open]]/session:invisible">
            {streaming ? (
              <span className="inline-block size-2 animate-spin rounded-full border border-border-strong border-t-ink" aria-label="Session streaming" />
            ) : unseen ? (
              <span className="inline-block size-1.5 rounded-full bg-accent" aria-label="Finished while closed" role="status" />
            ) : (
              formatRelativeTime(updatedAt)
            )}
          </span>
          <SessionActionsMenu
            onRename={startRenaming}
            projectPath={projectPath}
            sessionId={sessionId}
            sessionTitle={title}
            triggerClassName="col-start-1 row-start-1 size-5 opacity-0 group-hover/session:opacity-100 group-focus-within/session:opacity-100 data-popup-open:opacity-100"
          />
        </span>
      </Button>
    </li>
  );
}
