export interface WorkspaceChangesTab {
  readonly id: string;
  readonly kind: "changes";
  readonly repositoryRoot: string | null;
  readonly selection: string | null;
}

export interface WorkspaceFilesTab {
  readonly file: string | null;
  readonly id: string;
  readonly kind: "files";
  readonly pinned: boolean;
}

export interface WorkspaceTerminalTab {
  readonly id: string;
  readonly kind: "terminal";
  readonly number?: number;
  readonly exitCode?: number;
  readonly closed?: boolean;
}

export type WorkspacePanelTab = WorkspaceChangesTab | WorkspaceFilesTab | WorkspaceTerminalTab;
export type WorkspacePanelTabKind = WorkspacePanelTab["kind"];
