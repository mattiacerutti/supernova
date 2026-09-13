import type {WorkspaceChangeEntry, WorkspaceFileNode} from "@/features/workspace/types/workspace";
import {directoryOf, fileNameOf} from "@/features/workspace/lib/file-info";

export interface FileTreeNode {
  readonly children: readonly FileTreeNode[];
  readonly directoryLabel?: string;
  readonly entry?: WorkspaceChangeEntry;
  readonly kind: "directory" | "file";
  readonly label: string;
  readonly path: string;
}

export interface FileTreeRowData {
  readonly depth: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly node: FileTreeNode;
}

interface DraftNode {
  readonly children: Map<string, DraftNode>;
  entry?: WorkspaceChangeEntry;
  readonly name: string;
  readonly path: string;
}

/** Directories first, then alphabetical. */
function compareNodes(left: FileTreeNode, right: FileTreeNode): number {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return left.label.localeCompare(right.label);
}

/** Merges single-directory chains into one row. */
function toChangeNode(draft: DraftNode, label: string): FileTreeNode {
  if (draft.entry) return {children: [], entry: draft.entry, kind: "file", label, path: draft.path};

  let current = draft;
  let mergedLabel = label;
  while (current.children.size === 1) {
    const [child] = current.children.values();
    if (!child || child.entry) break;
    mergedLabel = `${mergedLabel}/${child.name}`;
    current = child;
  }

  const children = [...current.children.values()].map((child) => toChangeNode(child, child.name)).sort(compareNodes);
  return {children, kind: "directory", label: mergedLabel, path: current.path};
}

export function buildChangeTree(entries: readonly WorkspaceChangeEntry[]): readonly FileTreeNode[] {
  const root: DraftNode = {children: new Map(), name: "", path: ""};

  for (const entry of entries) {
    let current = root;
    for (const segment of entry.path.split("/").filter(Boolean)) {
      const path = current.path ? `${current.path}/${segment}` : segment;
      const child = current.children.get(segment) ?? {children: new Map(), name: segment, path};
      current.children.set(segment, child);
      current = child;
    }
    current.entry = entry;
  }

  return [...root.children.values()].map((child) => toChangeNode(child, child.name)).sort(compareNodes);
}

export function buildFlatChangeList(entries: readonly WorkspaceChangeEntry[]): readonly FileTreeNode[] {
  return entries
    .map<FileTreeNode>((entry) => ({children: [], directoryLabel: directoryOf(entry.path), entry, kind: "file", label: fileNameOf(entry.path), path: entry.path}))
    .toSorted((left, right) => left.path.localeCompare(right.path));
}

export function buildFileTree(nodes: readonly WorkspaceFileNode[]): readonly FileTreeNode[] {
  return nodes.map<FileTreeNode>((node) => ({children: buildFileTree(node.children ?? []), kind: node.kind, label: node.name, path: node.path})).sort(compareNodes);
}

/** Visible rows; only expanded branches are walked. */
export function flattenTree(nodes: readonly FileTreeNode[], isExpanded: (node: FileTreeNode) => boolean, depth = 0): readonly FileTreeRowData[] {
  return nodes.flatMap((node) => {
    const expandable = node.children.length > 0;
    const expanded = expandable && isExpanded(node);
    const row: FileTreeRowData = {depth, expandable, expanded, node};
    return expanded ? [row, ...flattenTree(node.children, isExpanded, depth + 1)] : [row];
  });
}

/** Rows a directory would reveal, so an expansion can be sized before the rows exist. */
export function countVisibleDescendants(node: FileTreeNode, isExpanded: (node: FileTreeNode) => boolean): number {
  return node.children.reduce((total, child) => total + 1 + (child.children.length > 0 && isExpanded(child) ? countVisibleDescendants(child, isExpanded) : 0), 0);
}

export function filterFileTree(nodes: readonly FileTreeNode[], query: string): readonly FileTreeNode[] {
  const needle = query.trim().toLowerCase();
  const matches: FileTreeNode[] = [];
  const visit = (node: FileTreeNode): void => {
    if (node.kind === "file" && node.path.toLowerCase().includes(needle)) {
      matches.push({children: [], directoryLabel: directoryOf(node.path), kind: "file", label: fileNameOf(node.path), path: node.path});
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return matches.toSorted((left, right) => left.path.localeCompare(right.path));
}
