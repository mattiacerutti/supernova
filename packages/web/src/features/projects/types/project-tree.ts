export interface IProjectTreeChat {
  id: string;
  pinned: boolean;
  title: string;
  updatedAt: string;
}

export interface IProjectTreeProject {
  id: string;
  name: string;
  path: string;
  pinned: boolean;
  pinnedChatIds: string[];
}
