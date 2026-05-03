export type SidebarActionId = "new-chat" | "new-project" | "search";

export interface ISidebarAction {
  id: SidebarActionId;
  icon: "edit" | "folder" | "search";
  label: string;
}

export interface ISidebarChat {
  id: string;
  title: string;
  updatedAt: string;
}

export interface ISidebarProject {
  id: string;
  name: string;
  chats: ISidebarChat[];
}
