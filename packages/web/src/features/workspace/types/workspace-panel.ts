export interface WorkspaceChangesTab {
  readonly id: string;
  readonly kind: "changes";
  /** Root from `listWorkspaceRepositories`; null until the user picks one, meaning the first discovered. */
  readonly repositoryRoot: string | null;
  /** Repository-relative path of the uncommitted change whose diff is shown. */
  readonly selection: string | null;
}

export interface WorkspaceFilesTab {
  readonly file: string | null;
  readonly id: string;
  readonly kind: "files";
  readonly pinned: boolean;
}

/**
 * A shell on the server. The id doubles as the terminal id, so the tab reattaches to its shell by id after a reload.
 * `number` is the server's, known once the shell runs; a tab without one still has to start its shell.
 */
export interface WorkspaceTerminalTab {
  readonly id: string;
  readonly kind: "terminal";
  readonly number?: number;
  /** Set once the shell has exited; the terminal stays on the server until it is closed. */
  readonly exitCode?: number;
  /** Set once the terminal no longer exists on the server: killed elsewhere, its session archived, the server restarted. */
  readonly closed?: boolean;
}

export type WorkspacePanelTab = WorkspaceChangesTab | WorkspaceFilesTab | WorkspaceTerminalTab;
export type WorkspacePanelTabKind = WorkspacePanelTab["kind"];
