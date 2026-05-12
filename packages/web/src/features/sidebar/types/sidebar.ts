export type SidebarActionId = "new-project" | "search";

export interface SidebarAction {
  id: SidebarActionId;
  icon: "folder" | "search";
  label: string;
}
