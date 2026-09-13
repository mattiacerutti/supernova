import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import DiffStat from "@/features/workspace/components/changes/diff/diff-stat";
import ExpandableVirtualList from "@/features/workspace/components/file-tree/expandable-virtual-list";
import type {ExpansionOptions} from "@/features/workspace/components/file-tree/expandable-virtual-list";
import FileTreeRow, {FILE_TREE_ROW_HEIGHT_PX} from "@/features/workspace/components/file-tree/file-tree-row";
import {directoryOf, fileNameOf} from "@/features/workspace/lib/file-info";
import type {FileTreeRowData} from "@/features/workspace/lib/file-tree";
import type {WorkspaceChangeEntry, WorkspaceCommit, WorkspaceChangeSelection} from "@/features/workspace/types/workspace";
import {formatRelativeTime} from "@/lib/format-relative-time";
import {cn} from "@/lib/cn";

const COMMIT_ROW_HEIGHT_PX = 46;

type CommitListRow =
  | {readonly commit: WorkspaceCommit; readonly expanded: boolean; readonly type: "commit"}
  | {readonly commitId: string; readonly fileRow: FileTreeRowData; readonly type: "file"};

interface CommitRowProps {
  readonly commit: WorkspaceCommit;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}

function CommitRow(props: CommitRowProps) {
  const {commit, expanded, onToggle} = props;

  return (
    <Button aria-expanded={expanded} className="group flex h-full w-full items-center gap-1.5 pl-1.5 pr-3 text-left" onClick={onToggle} variant="primary">
      <span className="grid w-3 shrink-0 place-items-center">
        <Icon className={cn("text-ink-faint transition-transform duration-160 ease-out", expanded && "rotate-90")} name="chevron-right" size="xs" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm leading-4 text-ink-muted group-hover:text-ink-strong">{commit.subject}</span>
        <span className="flex min-w-0 items-center gap-1.5 text-xs leading-4 text-ink-faint">
          <span className="font-mono">{commit.id.slice(0, 7)}</span>
          <span aria-hidden="true">·</span>
          <span className="min-w-0 truncate">{commit.authorName}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">{formatRelativeTime(commit.authoredAt)}</span>
        </span>
      </span>
      <DiffStat additions={commit.additions} deletions={commit.deletions} />
    </Button>
  );
}

interface CommitsListProps {
  readonly commits: readonly WorkspaceCommit[];
  readonly getCommitChanges: (commitId: string) => readonly WorkspaceChangeEntry[];
  readonly onSelectFile: (selection: WorkspaceChangeSelection) => void;
  readonly selection: WorkspaceChangeSelection | null;
}

export default function CommitsList(props: CommitsListProps) {
  const {commits, getCommitChanges, onSelectFile, selection} = props;
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(new Set());

  const rows = commits.flatMap<CommitListRow>((commit) => {
    const expanded = expandedIds.has(commit.id);
    const files = expanded
      ? getCommitChanges(commit.id).map<CommitListRow>((entry) => ({
          commitId: commit.id,
          fileRow: {
            depth: 1,
            expandable: false,
            expanded: false,
            node: {children: [], directoryLabel: directoryOf(entry.path), entry, kind: "file", label: fileNameOf(entry.path), path: `${commit.id}:${entry.path}`},
          },
          type: "file",
        }))
      : [];
    return [{commit, expanded, type: "commit"}, ...files];
  });

  const rowHeight = (index: number): number => (rows[index]?.type === "commit" ? COMMIT_ROW_HEIGHT_PX : FILE_TREE_ROW_HEIGHT_PX);

  const toggle = (commitId: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (!next.delete(commitId)) next.add(commitId);
      return next;
    });
  };

  const renderRow = (index: number, expand: (options: ExpansionOptions) => void) => {
    const row = rows[index]!;

    if (row.type === "file") {
      const entry = row.fileRow.node.entry!;
      const selected = selection?.scope === "commit" && selection.commitId === row.commitId && selection.path === entry.path;
      return <FileTreeRow onSelect={() => onSelectFile({commitId: row.commitId, path: entry.path, scope: "commit"})} row={row.fileRow} selected={selected} />;
    }

    const handleToggle = (): void => {
      const count = getCommitChanges(row.commit.id).length;
      const topPx = rows.slice(0, index + 1).reduce((total, _, rowIndex) => total + rowHeight(rowIndex), 0);
      const geometry = {count, firstIndex: index + 1, heightPx: count * FILE_TREE_ROW_HEIGHT_PX, topPx};
      if (row.expanded) {
        expand({...geometry, onCollapsed: () => toggle(row.commit.id), phase: "collapse"});
        return;
      }
      toggle(row.commit.id);
      expand({...geometry, phase: "expand"});
    };

    return <CommitRow commit={row.commit} expanded={row.expanded} onToggle={handleToggle} />;
  };

  if (commits.length === 0) return <p className="px-3 py-2 text-sm text-ink-faint">No commits yet.</p>;

  return (
    <ExpandableVirtualList
      estimateSize={rowHeight}
      getKey={(index) => {
        const row = rows[index]!;
        return row.type === "commit" ? row.commit.id : row.fileRow.node.path;
      }}
      label="Commits"
      renderRow={renderRow}
      role="list"
      rowCount={rows.length}
    />
  );
}
