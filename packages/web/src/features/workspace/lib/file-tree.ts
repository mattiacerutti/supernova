import type {WorkspaceChangeEntry} from "@supernova/contracts/workspace/schemas";
import {directoryOf, fileNameOf} from "@/features/workspace/lib/file-info";

export interface FileTreeNode {
  readonly children: readonly FileTreeNode[];
  /** Muted directory prefix shown before the label in flat lists. */
  readonly directoryLabel?: string;
  /** Present when the file comes from a change set. */
  readonly changeEntry?: WorkspaceChangeEntry;
  readonly kind: "directory" | "file";
  readonly label: string;
  readonly path: string;
}

interface DraftNode {
  readonly children: Map<string, DraftNode>;
  readonly name: string;
  readonly path: string;
}

type EntryMap = ReadonlyMap<string, WorkspaceChangeEntry>;

/** Directories first, then alphabetical. */
function compareNodes(left: FileTreeNode, right: FileTreeNode): number {
  if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
  return left.label.localeCompare(right.label);
}

/** Converts a draft to a node, merging single-child directory chains into one row. */
function toNode(draft: DraftNode, label: string, entries: EntryMap): FileTreeNode {
  if (draft.children.size === 0) return {changeEntry: entries.get(draft.path), children: [], kind: "file", label, path: draft.path};

  let current = draft;
  let mergedLabel = label;
  while (current.children.size === 1) {
    const [child] = current.children.values();
    if (!child || child.children.size === 0) break;
    mergedLabel = `${mergedLabel}/${child.name}`;
    current = child;
  }

  const children = [...current.children.values()].map((child) => toNode(child, child.name, entries)).sort(compareNodes);
  return {children, kind: "directory", label: mergedLabel, path: current.path};
}

/** Nests repository-relative file paths into directories; entries attach git status to their files. */
export function buildTree(paths: readonly string[], entries: EntryMap = new Map()): readonly FileTreeNode[] {
  const root: DraftNode = {children: new Map(), name: "", path: ""};
  for (const fullPath of paths) {
    let current = root;
    for (const segment of fullPath.split("/").filter(Boolean)) {
      const path = current.path ? `${current.path}/${segment}` : segment;
      const child = current.children.get(segment) ?? {children: new Map(), name: segment, path};
      current.children.set(segment, child);
      current = child;
    }
  }
  return [...root.children.values()].map((child) => toNode(child, child.name, entries)).sort(compareNodes);
}

/** Path-sorted file rows with the directory as a muted prefix, for flat and search views. */
export function buildFlatList(paths: readonly string[], entries: EntryMap = new Map()): readonly FileTreeNode[] {
  return paths
    .map<FileTreeNode>((path) => ({children: [], directoryLabel: directoryOf(path), changeEntry: entries.get(path), kind: "file", label: fileNameOf(path), path}))
    .toSorted((left, right) => left.path.localeCompare(right.path));
}
