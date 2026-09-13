import {useState} from "react";
import ExpandableVirtualList from "@/features/workspace/components/file-tree/expandable-virtual-list";
import type {ExpansionOptions} from "@/features/workspace/components/file-tree/expandable-virtual-list";
import FileTreeRow, {FILE_TREE_ROW_HEIGHT_PX} from "@/features/workspace/components/file-tree/file-tree-row";
import type {FileTreeRowData} from "@/features/workspace/components/file-tree/file-tree-row";
import type {FileTreeNode} from "@/features/workspace/lib/file-tree";

/** Visible rows; only expanded branches are walked. */
function flattenTree(nodes: readonly FileTreeNode[], isExpanded: (node: FileTreeNode) => boolean, depth = 0): readonly FileTreeRowData[] {
  return nodes.flatMap((node) => {
    const expandable = node.children.length > 0;
    const expanded = expandable && isExpanded(node);
    const row: FileTreeRowData = {depth, expandable, expanded, node};
    return expanded ? [row, ...flattenTree(node.children, isExpanded, depth + 1)] : [row];
  });
}

/** Rows a directory would reveal, so an expansion can be sized before the rows exist. */
function countVisibleDescendants(node: FileTreeNode, isExpanded: (node: FileTreeNode) => boolean): number {
  return node.children.reduce((total, child) => total + 1 + (child.children.length > 0 && isExpanded(child) ? countVisibleDescendants(child, isExpanded) : 0), 0);
}

interface FileTreeProps {
  readonly emptyLabel: string;
  /** Flips what `toggledPaths` tracks: closed directories instead of opened ones. */
  readonly expandedByDefault?: boolean;
  readonly label: string;
  readonly nodes: readonly FileTreeNode[];
  readonly onSelectFile: (node: FileTreeNode) => void;
  readonly selectedPath?: string;
}

export default function FileTree(props: FileTreeProps) {
  const {emptyLabel, expandedByDefault = false, label, nodes, onSelectFile, selectedPath} = props;
  const [toggledPaths, setToggledPaths] = useState<ReadonlySet<string>>(new Set());

  const isExpanded = (node: FileTreeNode): boolean => toggledPaths.has(node.path) !== expandedByDefault;
  const rows = flattenTree(nodes, isExpanded);

  const toggle = (path: string): void => {
    setToggledPaths((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  };

  const renderRow = (index: number, expand: (options: ExpansionOptions) => void) => {
    const row = rows[index]!;

    const handleSelect = (selectedRow: FileTreeRowData): void => {
      if (selectedRow.node.kind === "file") {
        onSelectFile(selectedRow.node);
        return;
      }

      const count = countVisibleDescendants(selectedRow.node, isExpanded);
      const geometry = {count, firstIndex: index + 1, heightPx: count * FILE_TREE_ROW_HEIGHT_PX, topPx: (index + 1) * FILE_TREE_ROW_HEIGHT_PX};
      if (selectedRow.expanded) {
        expand({...geometry, onCollapsed: () => toggle(selectedRow.node.path), phase: "collapse"});
        return;
      }
      toggle(selectedRow.node.path);
      expand({...geometry, phase: "expand"});
    };

    return <FileTreeRow onSelect={handleSelect} row={row} selected={row.node.kind === "file" && row.node.path === selectedPath} />;
  };

  if (rows.length === 0) return <p className="px-3 py-2 text-sm text-ink-faint">{emptyLabel}</p>;

  return (
    <ExpandableVirtualList
      estimateSize={() => FILE_TREE_ROW_HEIGHT_PX}
      getKey={(index) => rows[index]!.node.path}
      label={label}
      renderRow={renderRow}
      role="tree"
      rowCount={rows.length}
    />
  );
}
