import type {ISidebarAction, ISidebarProject} from "@/features/sidebar/types/sidebar";

export const sidebarActions: ISidebarAction[] = [
  {id: "new-chat", icon: "edit", label: "New chat"},
  {id: "new-project", icon: "folder", label: "New project"},
  {id: "search", icon: "search", label: "Search"},
];

export const sidebarProjects: ISidebarProject[] = [
  {
    id: "pi-desktop",
    name: "pi-desktop",
    chats: [
      {id: "chrome", title: "Integrate native window chrome", updatedAt: "Today"},
      {id: "sidebar", title: "Build the project sidebar", updatedAt: "Today"},
      {id: "runtime", title: "Wire the Pi runtime events", updatedAt: "2d"},
    ],
  },
  {
    id: "barks",
    name: "barks",
    chats: [
      {id: "formatting", title: "Check auto-formatting behavior", updatedAt: "2d"},
      {id: "subagent", title: "Spawn subagent manually", updatedAt: "2d"},
      {id: "skills", title: "$skill-installer discovery", updatedAt: "3mo"},
    ],
  },
  {
    id: "trpc-diff",
    name: "trpc-diff",
    chats: [{id: "review", title: "Review uncommitted changes", updatedAt: "2d"}],
  },
  {
    id: "oasdiff-js",
    name: "oasdiff-js",
    chats: [],
  },
];
