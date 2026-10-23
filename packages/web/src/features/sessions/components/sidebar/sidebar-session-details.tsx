import type {ReactNode} from "react";
import type {SessionSummary} from "@supernova/contracts/services/sessions/schemas";
import Icon from "@/components/ui/icon";
import type {SessionStatusKind} from "@/features/sessions/lib/session-view";
import {formatRelativeTime} from "@/lib/format-relative-time";

const STATUS_LABELS: Partial<Record<SessionStatusKind, string>> = {compacting: "Compacting context", stopping: "Stopping", streaming: "Working"};

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
  readonly session: SessionSummary;
  readonly status: SessionStatusKind;
  readonly unseen: boolean;
}

/** The hover card beside a sidebar session: its full title and what the row has no room for. */
export default function SidebarSessionDetails(props: SidebarSessionDetailsProps) {
  const {session, status, unseen} = props;
  const {forked, title, updatedAt, worktree} = session;
  const statusLabel = STATUS_LABELS[status];

  return (
    <div className="flex w-64 flex-col p-1" data-session-details>
      <div className="flex items-start gap-3 px-2 pb-1 pt-1.5">
        <span className="line-clamp-3 min-w-0 flex-1 text-sm leading-5 wrap-break-word text-ink">{title}</span>
        <span className="shrink-0 text-xs leading-5 text-ink-faint">{formatRelativeTime(updatedAt)}</span>
      </div>
      {statusLabel && <DetailRow icon={<span className="inline-block size-2 animate-spin rounded-full border border-border-strong border-t-ink" />}>{statusLabel}</DetailRow>}
      {!statusLabel && unseen && <DetailRow icon={<span className="inline-block size-1.5 rounded-full bg-accent" />}>Finished while you were away</DetailRow>}
      {worktree && <DetailRow icon={<Icon name="folder-git" size="xs" />}>{worktree.branch}</DetailRow>}
      {forked && <DetailRow icon={<Icon name="git-branch" size="xs" />}>Forked session</DetailRow>}
    </div>
  );
}
