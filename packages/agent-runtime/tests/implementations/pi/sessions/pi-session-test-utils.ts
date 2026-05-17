import type {AgentSession, SessionEntry} from "@mariozechner/pi-coding-agent";
import {Effect, Stream} from "effect";
import type {PiSessionInfo} from "@pi-desktop/agent-runtime/implementations/pi/pi-sdk";
import type {SessionStreamEvent} from "@pi-desktop/contracts/sessions/procedures";
import type {ModelReference} from "@pi-desktop/contracts/sessions/schemas";

export const selectedPiModel = {id: "claude-sonnet", name: "Claude Sonnet", provider: "anthropic", reasoning: true};
export const selectedModelReference: ModelReference = {id: "claude-sonnet", providerId: "anthropic", thinkingLevel: "high"};

export const piSessionInfo = {
  cwd: "/workspace",
  firstMessage: "Fix it",
  id: "session-1",
  modified: new Date("2026-01-01T00:00:00.000Z"),
  name: "Fix it",
  path: "/sessions/session-1.jsonl",
} as PiSessionInfo;

export const imageAttachment = {contentBase64: "aW1hZ2UtYnl0ZXM=", id: "image-1", mime: "image/png", name: "diagram.png", size: 12};
export const textAttachment = {contentBase64: "VGhpcyBpcyBhIHRleHQgZmlsZS4=", id: "text-1", mime: "text/plain", name: "notes.txt", size: 20};
export const ignoredAttachment = {contentBase64: "YmluYXJ5", id: "binary-1", mime: "application/octet-stream", name: "archive.bin", size: 6};

export function piAgentMessage(input: unknown): AgentSession["messages"][number] {
  return input as AgentSession["messages"][number];
}

export function userMessage(text: string, timestamp = 1): AgentSession["messages"][number] {
  return piAgentMessage({content: [{text, type: "text"}], id: `user-${timestamp}`, role: "user", timestamp});
}

export function assistantMessage(text: string, timestamp = 2): AgentSession["messages"][number] {
  return piAgentMessage({content: [{text, type: "text"}], id: `assistant-${timestamp}`, role: "assistant", timestamp});
}

export function piEntries(messages: readonly AgentSession["messages"][number][]): SessionEntry[] {
  let parentId: string | null = null;

  return messages.map((message, index) => {
    const timestamp = new Date(message.timestamp).toISOString();
    const entry: SessionEntry = {
      id: `entry-${index}`,
      message,
      parentId,
      timestamp,
      type: "message",
    };

    parentId = entry.id;
    return entry;
  });
}

export async function collectEvents(stream: Stream.Stream<SessionStreamEvent>): Promise<SessionStreamEvent[]> {
  const events: SessionStreamEvent[] = [];
  await Effect.runPromise(Stream.runForEach(stream, (event) => Effect.sync(() => events.push(event))));
  return events;
}

export async function waitUntil(assertion: () => void): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < 1_000) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  throw lastError;
}
