export type SidebarActionId = "new-project" | "search";

export interface ISidebarAction {
  id: SidebarActionId;
  icon: "folder" | "search";
  label: string;
}
