import type {ToolResultMessage, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";

export interface SessionToolCall {
  readonly callId: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>> | undefined;
  readonly status: "pending" | "completed" | "error";
  readonly result: ToolResultMessage | undefined;
  readonly output: string | undefined;
}

export interface SessionUserMessage {
  readonly id: string;
  readonly contentParts: readonly UserMessageContentPart[];
  readonly timestamp: string;
}

interface SessionTurnEventBase {
  /** Stable within the turn: a streamed partial and the entry that replaces it share ids. */
  readonly id: string;
  readonly timestamp: string;
}

export interface SessionAssistantEvent extends SessionTurnEventBase {
  readonly type: "assistant";
  readonly content: string;
  readonly error?: string;
}

export interface SessionReasoningEvent extends SessionTurnEventBase {
  readonly type: "reasoning";
  readonly content: string;
}

export interface SessionWorkEvent extends SessionTurnEventBase {
  readonly type: "tool";
  readonly durationMs?: number;
  readonly tool: SessionToolCall;
}

export interface SessionCompactionEvent extends SessionTurnEventBase {
  readonly type: "compaction";
  readonly status: "pending" | "completed";
  readonly summary?: string;
}

export type SessionTurnEvent = SessionAssistantEvent | SessionCompactionEvent | SessionReasoningEvent | SessionWorkEvent;

export interface SessionTurn {
  readonly id: string;
  readonly status: "completed" | "error" | "streaming";
  readonly userMessage: SessionUserMessage;
  readonly events: readonly SessionTurnEvent[];
  readonly startedAt: string;
  readonly completedAt: string | undefined;
}
