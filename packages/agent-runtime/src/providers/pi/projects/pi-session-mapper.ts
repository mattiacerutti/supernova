import {basename} from "node:path";
import type {IAgentChatSummary, IAgentProjectSummary} from "@pi-desktop/contracts";
import type {IProjectAccumulator, PiSessionInfo} from "@pi-desktop/agent-runtime/providers/pi/projects/types";

function toProjectId(cwd: string): string {
  return Buffer.from(cwd).toString("base64url");
}

function toProjectName(cwd: string): string {
  const name = basename(cwd);
  return name.length > 0 ? name : cwd;
}

function toChatTitle(session: PiSessionInfo): string {
  const explicitName = session.name?.trim();
  if (explicitName) return explicitName;

  const firstMessage = session.firstMessage.trim();
  if (firstMessage.length > 0 && firstMessage !== "(no messages)") return firstMessage;

  return "Untitled chat";
}

function toChatSummary(session: PiSessionInfo): IAgentChatSummary {
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

export function groupPiSessionsByProject(sessions: PiSessionInfo[]): IAgentProjectSummary[] {
  const projectsByCwd = new Map<string, IProjectAccumulator>();

  for (const session of sessions) {
    const cwd = session.cwd.trim();
    if (cwd.length === 0) continue;

    const chat = toChatSummary(session);
    const existing = projectsByCwd.get(cwd);
    if (existing) {
      existing.chats.push(chat);
      if (new Date(chat.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        existing.updatedAt = chat.updatedAt;
      }
      continue;
    }

    projectsByCwd.set(cwd, {
      chats: [chat],
      cwd,
      updatedAt: chat.updatedAt,
    });
  }

  return Array.from(projectsByCwd.values())
    .map((project) => ({
      chats: project.chats.toSorted(compareUpdatedAtDescending),
      id: toProjectId(project.cwd),
      name: toProjectName(project.cwd),
      updatedAt: project.updatedAt,
    }))
    .toSorted(compareUpdatedAtDescending);
}
