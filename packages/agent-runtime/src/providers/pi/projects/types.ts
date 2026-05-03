import type {SessionInfo} from "@mariozechner/pi-coding-agent";

export type PiSessionInfo = Pick<SessionInfo, "cwd" | "firstMessage" | "id" | "messageCount" | "modified" | "name">;

export interface IProjectAccumulator {
  readonly chats: Array<{
    id: string;
    messageCount: number;
    title: string;
    updatedAt: string;
  }>;
  readonly cwd: string;
  updatedAt: string;
}
