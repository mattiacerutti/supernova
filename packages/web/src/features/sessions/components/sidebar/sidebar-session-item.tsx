import {useState} from "react";
import type {SessionSummary} from "@supernova/contracts/services/sessions/schemas";
import {useLocation, useNavigate} from "@tanstack/react-router";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Tooltip from "@/components/ui/tooltip";
import {usePrefetchSession} from "@/features/sessions/api/sessions-sync";
import {useSessionStatus} from "@/features/sessions/hooks/use-session";
import {useRenameSession} from "@/features/sessions/api/sidebar/rename-session";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import SidebarSessionDetails from "@/features/sessions/components/sidebar/sidebar-session-details";
import {hasUnseenActivity, useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {cn} from "@/lib/cn";
import {formatRelativeTime} from "@/lib/format-relative-time";

interface SidebarSessionItemProps {
  readonly projectPath: string;
  readonly session: SessionSummary;
}

export default function SidebarSessionItem(props: SidebarSessionItemProps) {
  const {projectPath, session} = props;
  const {forked, id: sessionId, pinned, title, updatedAt, worktree} = session;
  const location = useLocation();
  const navigate = useNavigate();
  const prefetchSession = usePrefetchSession();
  const renameSession = useRenameSession();
  const liveStatus = useSessionStatus(sessionId).status;
  const visitedAt = useSessionVisitsStore((state) => state.visits[sessionId]);
  const {inputProps, renaming, startRenaming} = useInlineRename({initialValue: title, onSave: (nextTitle) => renameSession.mutate({sessionId, title: nextTitle})});
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const selected = location.pathname === `/session/${sessionId}`;
  const streaming = liveStatus === "streaming" || liveStatus === "stopping" || liveStatus === "compacting";
  const unseen = !streaming && hasUnseenActivity({activityAtMs: Date.parse(updatedAt), visitedAt});

  const handleOpen = (): void => {
    void navigate({params: {sessionId}, to: "/session/$sessionId"});
  };

  const handlePrefetch = (): void => {
    if (selected) return;
    prefetchSession(sessionId);
  };

  return (
    <Tooltip
      align="start"
      content={<SidebarSessionDetails session={session} status={liveStatus} unseen={unseen} />}
      disabled={(!worktree && !forked) || renaming || actionsMenuOpen}
      side="right"
      sideOffset={16}
    >
      <li onFocusCapture={handlePrefetch} onPointerDown={handlePrefetch} onPointerEnter={handlePrefetch}>
        <Button
          as="div"
          className={cn("group/session flex w-full items-center gap-2 py-1.5 pl-2 pr-2 text-left", selected && "bg-overlay-pressed text-ink")}
          onClick={handleOpen}
          variant="primary"
        >
          <span className="grid size-4 shrink-0 place-items-center">
            {pinned && <Icon aria-label="Pinned session" className="text-ink-muted" name="pin" role="img" size="xs" />}
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
            {(worktree || forked) && (
              <span aria-hidden="true" className="flex shrink-0 items-center gap-1 text-ink-faint">
                {worktree && <Icon name="folder-git" size="xs" />}
                {/* The fork glyph fills more of its box than the worktree folder, so it is drawn smaller to match. */}
                {forked && <Icon className="size-3" name="git-branch" size="xs" />}
              </span>
            )}
            {/* The hover card is not announced, so the row carries the same facts as text. */}
            {worktree && <span className="sr-only">Worktree session on {worktree.branch}</span>}
            {forked && <span className="sr-only">Forked session</span>}
          </div>
          <span className="grid w-8 shrink-0 place-items-center justify-items-end">
            <span className="col-start-1 row-start-1 w-full justify-self-end whitespace-nowrap pr-0.75 text-right text-xs text-ink-muted group-hover/session:invisible group-focus-visible/session:invisible group-has-[:focus-visible]/session:invisible group-has-[[data-popup-open]]/session:invisible">
              {streaming ? (
                <span className="inline-block size-2 animate-spin rounded-full border border-border-strong border-t-ink" aria-label="Session streaming" />
              ) : unseen ? (
                <span className="inline-block size-1.5 rounded-full bg-accent" aria-label="Finished while closed" role="status" />
              ) : (
                formatRelativeTime(updatedAt)
              )}
            </span>
            <SessionActionsMenu
              onOpenChange={setActionsMenuOpen}
              onRename={startRenaming}
              pinned={pinned}
              projectPath={projectPath}
              sessionId={sessionId}
              sessionTitle={title}
              worktree={worktree !== undefined}
              triggerClassName="col-start-1 row-start-1 size-5 opacity-0 group-hover/session:opacity-100 group-focus-visible/session:opacity-100 group-has-[:focus-visible]/session:opacity-100 data-popup-open:opacity-100"
            />
          </span>
        </Button>
      </li>
    </Tooltip>
  );
}
