import type {SessionInfo} from "@mariozechner/pi-coding-agent";
import type {IAgentChatSummary} from "@pi-desktop/contracts/projects";

export type PiSessionInfo = Pick<SessionInfo, "cwd" | "firstMessage" | "id" | "messageCount" | "modified" | "name">;

function toChatTitle(session: PiSessionInfo): string {
  const explicitName = session.name?.trim();
  if (explicitName) return explicitName;

  const firstMessage = session.firstMessage.trim();
  if (firstMessage.length > 0 && firstMessage !== "(no messages)") return firstMessage;

  return "Untitled chat";
}

export function toPiSessionChatSummary(session: PiSessionInfo): IAgentChatSummary {
  return {
    id: session.id,
    messageCount: session.messageCount,
    title: toChatTitle(session),
    updatedAt: session.modified.toISOString(),
  };
}

function compareUpdatedAtDescending(left: {updatedAt: string}, right: {updatedAt: string}): number {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

export function mapPiSessionsToChats(sessions: PiSessionInfo[]): IAgentChatSummary[] {
  return sessions.map(toPiSessionChatSummary).toSorted(compareUpdatedAtDescending);
}
