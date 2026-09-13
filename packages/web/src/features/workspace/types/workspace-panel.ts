import type {WorkspaceChangeSelection} from "@/features/workspace/types/workspace";

export interface WorkspaceChangesTab {
  readonly id: string;
  readonly kind: "changes";
  readonly selection: WorkspaceChangeSelection | null;
}

export interface WorkspaceFilesTab {
  readonly file: string | null;
  readonly id: string;
  readonly kind: "files";
  readonly pinned: boolean;
}

export type WorkspacePanelTab = WorkspaceChangesTab | WorkspaceFilesTab;
export type WorkspacePanelTabKind = WorkspacePanelTab["kind"];
