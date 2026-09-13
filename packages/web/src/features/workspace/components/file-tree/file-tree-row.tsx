import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import FileIcon from "@/features/workspace/components/file-tree/file-icon";
import GitStatusBadge from "@/features/workspace/components/changes/diff/git-status-badge";
import type {FileTreeNode} from "@/features/workspace/lib/file-tree";
import {cn} from "@/lib/cn";

/** Virtualizer slot; the 28px row inside leaves a 2px gap. */
export const FILE_TREE_ROW_HEIGHT_PX = 30;

export const FILE_TREE_ROW_INDENT_PX = 12;

export interface FileTreeRowData {
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly node: FileTreeNode;
}

interface FileTreeRowProps {
  readonly onSelect: (row: FileTreeRowData) => void;
  readonly row: FileTreeRowData;
  readonly selected: boolean;
}

export default function FileTreeRow(props: FileTreeRowProps) {
  const {onSelect, row, selected} = props;
  const {depth, expandable, expanded, node} = row;
  const directory = node.kind === "directory";

  return (
    <Button
      aria-expanded={expandable ? expanded : undefined}
      aria-selected={selected}
      className={cn("flex h-7 w-full items-center gap-1.5 pr-3 text-sm text-ink-muted", selected && "bg-overlay-pressed text-ink-strong")}
      onClick={() => onSelect(row)}
      role="treeitem"
      style={{paddingLeft: `${6 + depth * FILE_TREE_ROW_INDENT_PX}px`}}
      variant="primary"
    >
      <span className="grid w-3 shrink-0 place-items-center">
        {expandable && <Icon className={cn("text-ink-faint transition-transform duration-160 ease-out", expanded && "rotate-90")} name="chevron-right" size="xs" />}
      </span>
      <span className="grid size-3.5 shrink-0 place-items-center text-ink-faint">
        {directory ? <Icon name={expanded ? "folder-open" : "folder"} size="xs" /> : <FileIcon path={node.path} />}
      </span>
      {/* The directory prefix truncates first so the file name stays readable. */}
      <span className={cn("flex min-w-0 flex-1 text-left", node.changeEntry?.status === "deleted" && "line-through")}>
        {node.directoryLabel && <span className="min-w-0 truncate text-ink-faint">{node.directoryLabel}/</span>}
        <span className="max-w-full shrink-0 truncate">{node.label}</span>
      </span>
      {node.changeEntry && <GitStatusBadge status={node.changeEntry.status} />}
    </Button>
  );
}
