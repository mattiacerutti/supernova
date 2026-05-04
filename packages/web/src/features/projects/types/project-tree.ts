export interface IProjectTreeChat {
  id: string;
  title: string;
  updatedAt: string;
}

export interface IProjectTreeProject {
  id: string;
  name: string;
  path: string;
  chats: IProjectTreeChat[];
}
