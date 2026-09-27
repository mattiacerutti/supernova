import type {SessionEntry} from "@earendil-works/pi-coding-agent";
import type {ModelReference, Session, Turn} from "@supernova/contracts/sessions/schemas";
import {buildSessionContextUsage} from "@supernova/agent-runtime/pi/lib/session/session-context-usage";
import type {PiSessionManager} from "@supernova/agent-runtime/pi/sdk";
import {buildPiTurns} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import {latestCheckpointCursor} from "@supernova/agent-runtime/pi/lib/session/checkpoint-entries";

/** The model a session last ran with, or undefined for a session that has never been prompted. */
export function sessionModelReference(sessionManager: PiSessionManager): ModelReference | undefined {
  const context = sessionManager.buildSessionContext();
  return context.model ? {id: context.model.modelId, providerId: context.model.provider, thinkingLevel: context.thinkingLevel} : undefined;
}

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

/**
 * Builds a committed session snapshot from the current Pi branch. Without a model reference the session has never
 * been prompted, so it has no turns; its title and timestamp still come from the branch.
 */
export function buildSessionSnapshot(input: {
  readonly contextWindow: number;
  readonly sessionManager: PiSessionManager;
  readonly modelReference: ModelReference | undefined;
}): Session {
  const {contextWindow, modelReference, sessionManager} = input;
  const branch = sessionManager.getBranch();
  const turns = modelReference ? buildPiTurns(branch, modelReference) : [];

  return {
    id: sessionManager.getSessionId(),
    modelReference,
    context: buildSessionContextUsage({contextWindow, entries: branch, messages: sessionManager.buildSessionContext().messages}),
    projectPath: sessionManager.getCwd(),
    title: sessionTitle(sessionManager, branch),
    turns,
    undoneTurns: modelReference ? buildUndoneTurns({sessionManager, modelReference}) : [],
    updatedAt: sessionUpdatedAt(sessionManager, turns),
  };
}
