export type WorkspaceChangeStatus = "added" | "deleted" | "modified" | "renamed" | "untracked";

export interface WorkspaceChangeEntry {
  readonly additions: number;
  readonly deletions: number;
  /** Repository-relative path, POSIX separators. */
  readonly path: string;
  readonly previousPath?: string;
  readonly status: WorkspaceChangeStatus;
}

export interface WorkspaceCommit {
  readonly additions: number;
  readonly authorName: string;
  /** ISO 8601 timestamp. */
  readonly authoredAt: string;
  readonly deletions: number;
  readonly id: string;
  readonly subject: string;
}

export interface WorkspaceFileNode {
  readonly children?: readonly WorkspaceFileNode[];
  readonly kind: "directory" | "file";
  readonly name: string;
  /** Repository-relative path, POSIX separators. */
  readonly path: string;
}

export interface WorkspaceSnapshot {
  readonly commits: readonly WorkspaceCommit[];
  readonly files: readonly WorkspaceFileNode[];
  readonly uncommitted: readonly WorkspaceChangeEntry[];
}

export type WorkspaceChangeSelection = {readonly path: string; readonly scope: "uncommitted"} | {readonly commitId: string; readonly path: string; readonly scope: "commit"};
