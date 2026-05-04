export type SidebarActionId = "new-chat" | "new-project" | "search";

export interface ISidebarAction {
  id: SidebarActionId;
  icon: "edit" | "folder" | "search";
  label: string;
}
