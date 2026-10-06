import type {ReactNode} from "react";
import Icon from "@/components/ui/icon";
import type {SessionLiveStatus} from "@/features/sessions/stores/conversation/session-live-store";
import {formatRelativeTime} from "@/lib/format-relative-time";

const LIVE_STATUS_LABELS: Partial<Record<SessionLiveStatus, string>> = {compacting: "Compacting context", stopping: "Stopping", streaming: "Working"};

interface DetailRowProps {
  readonly children: ReactNode;
  readonly icon: ReactNode;
}

function DetailRow(props: DetailRowProps) {
  const {children, icon} = props;

  return (
    <div className="flex min-w-0 items-center gap-2 px-2 py-1 text-xs text-ink-muted">
      <span className="grid size-3.5 shrink-0 place-items-center">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </div>
  );
}

interface SidebarSessionDetailsProps {
  readonly liveStatus: SessionLiveStatus | undefined;
  /** Set when the session was forked; `title` is missing when the parent has been archived. */
  readonly parent?: {readonly title: string | undefined};
  readonly title: string;
  readonly unseen: boolean;
  readonly updatedAt: string;
  readonly worktreeBranch?: string;
}

/** The hover card beside a sidebar session: its full title and what the row has no room for. */
export default function SidebarSessionDetails(props: SidebarSessionDetailsProps) {
  const {liveStatus, parent, title, unseen, updatedAt, worktreeBranch} = props;
  const liveStatusLabel = liveStatus && LIVE_STATUS_LABELS[liveStatus];

  return (
    <div className="flex w-64 flex-col p-1">
      <div className="flex items-start gap-3 px-2 pb-1 pt-1.5">
        <span className="line-clamp-3 min-w-0 flex-1 text-sm leading-5 wrap-break-word text-ink">{title}</span>
        <span className="shrink-0 text-xs leading-5 text-ink-faint">{formatRelativeTime(updatedAt)}</span>
      </div>
      {liveStatusLabel && (
        <DetailRow icon={<span className="inline-block size-2 animate-spin rounded-full border border-border-strong border-t-ink" />}>{liveStatusLabel}</DetailRow>
      )}
      {!liveStatusLabel && unseen && <DetailRow icon={<span className="inline-block size-1.5 rounded-full bg-accent" />}>Finished while you were away</DetailRow>}
      {worktreeBranch !== undefined && <DetailRow icon={<Icon name="folder-git" size="xs" />}>{worktreeBranch}</DetailRow>}
      {parent && (
        <DetailRow icon={<Icon name="git-branch" size="xs" />}>
          {parent.title === undefined ? (
            "Forked from an archived chat"
          ) : (
            <>
              Forked from <span className="text-ink">{parent.title}</span>
            </>
          )}
        </DetailRow>
      )}
    </div>
  );
}
