export type SidebarActionId = "new-project" | "new-session" | "search";

export interface ISidebarAction {
  id: SidebarActionId;
  icon: "edit" | "folder" | "search";
  label: string;
}
