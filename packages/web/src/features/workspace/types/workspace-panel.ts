export interface WorkspaceChangesTab {
  readonly id: string;
  readonly kind: "changes";
  /** Path of the uncommitted change whose diff is shown. */
  readonly selection: string | null;
}

export interface WorkspaceFilesTab {
  readonly file: string | null;
  readonly id: string;
  readonly kind: "files";
  readonly pinned: boolean;
}

export type WorkspacePanelTab = WorkspaceChangesTab | WorkspaceFilesTab;
export type WorkspacePanelTabKind = WorkspacePanelTab["kind"];
