import type {SessionEntry} from "@earendil-works/pi-coding-agent";
import type {ModelReference, Session, Turn} from "@supernova/contracts/sessions/schemas";
import {buildSessionContextUsage} from "@supernova/agent-runtime/layers/session-runtime/lib/session-context-usage";
import type {PiSessionManager} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";
import {buildPiTurns} from "@supernova/agent-runtime/layers/shared/lib/turns-builder";
import {latestCheckpointCursor} from "@supernova/agent-runtime/layers/session-runtime/lib/checkpoints/checkpoint-navigation";

/** Builds turns hidden behind the current checkpoint cursor and available for redo. */
export function buildUndoneTurns(input: {readonly sessionManager: PiSessionManager; readonly modelReference: ModelReference}): Session["undoneTurns"] {
  const cursor = latestCheckpointCursor(input.sessionManager.getEntries());
  if (!cursor || cursor.nodeEntryId === cursor.leafEntryId) return [];

  const redoBranch = input.sessionManager.getBranch(cursor.leafEntryId);
  const nodeIndex = cursor.nodeEntryId ? redoBranch.findIndex((entry) => entry.id === cursor.nodeEntryId) : -1;
  if (nodeIndex === -1 && cursor.nodeEntryId !== null) return [];

  return buildPiTurns(redoBranch.slice(nodeIndex + 1), input.modelReference);
}

/** Resolves the persisted title or first user message for an opened session. */
export function sessionTitle(sessionManager: PiSessionManager, branch: readonly SessionEntry[]): string {
  const explicitTitle = sessionManager.getSessionName()?.trim();
  if (explicitTitle) return explicitTitle;

  const firstUserMessage = branch.find((entry) => entry.type === "message" && entry.message.role === "user");
  if (firstUserMessage?.type !== "message" || firstUserMessage.message.role !== "user") return "Untitled session";

  const content = firstUserMessage.message.content;
  const firstMessage =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(" ")
        : "";
  return firstMessage.trim() || "Untitled session";
}

/** Resolves the latest visible turn or persisted session timestamp. */
export function sessionUpdatedAt(sessionManager: PiSessionManager, turns: readonly Turn[]): string {
  const latestTurn = turns.at(-1);
  const updatedAt = latestTurn?.completedAt ?? latestTurn?.startedAt ?? sessionManager.getLeafEntry()?.timestamp ?? sessionManager.getHeader()?.timestamp;
  if (!updatedAt) throw new Error("Session timestamp not found.");
  return updatedAt;
}

/** Builds a committed session snapshot from the current Pi branch. */
export function buildSessionSnapshot(input: {readonly contextWindow: number; readonly sessionManager: PiSessionManager; readonly modelReference: ModelReference}): Session {
  const branch = input.sessionManager.getBranch();
  const turns = buildPiTurns(branch, input.modelReference);

  return {
    id: input.sessionManager.getSessionId(),
    modelReference: input.modelReference,
    context: buildSessionContextUsage({contextWindow: input.contextWindow, entries: branch, messages: input.sessionManager.buildSessionContext().messages}),
    projectPath: input.sessionManager.getCwd(),
    title: sessionTitle(input.sessionManager, branch),
    turns,
    undoneTurns: buildUndoneTurns({sessionManager: input.sessionManager, modelReference: input.modelReference}),
    updatedAt: sessionUpdatedAt(input.sessionManager, turns),
  };
}
