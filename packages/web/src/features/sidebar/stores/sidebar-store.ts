import type {ISidebarAction} from "@/features/sidebar/types/sidebar";

export const sidebarActions: ISidebarAction[] = [
  {id: "new-chat", icon: "edit", label: "New chat"},
  {id: "new-project", icon: "folder", label: "New project"},
  {id: "search", icon: "search", label: "Search"},
];
