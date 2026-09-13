import type {WorkspaceChangeStatus} from "@/features/workspace/types/workspace";
import {cn} from "@/lib/cn";

const STATUS_LETTERS: Record<WorkspaceChangeStatus, string> = {added: "A", deleted: "D", modified: "M", renamed: "R", untracked: "U"};

const STATUS_COLORS: Record<WorkspaceChangeStatus, string> = {
  added: "text-diff-added",
  deleted: "text-diff-removed",
  modified: "text-accent",
  renamed: "text-accent",
  untracked: "text-diff-added",
};

interface GitStatusBadgeProps {
  readonly status: WorkspaceChangeStatus;
}

export default function GitStatusBadge(props: GitStatusBadgeProps) {
  const {status} = props;

  return (
    <span aria-label={status} className={cn("w-3.5 shrink-0 text-center text-xs font-medium", STATUS_COLORS[status])} role="img">
      {STATUS_LETTERS[status]}
    </span>
  );
}
