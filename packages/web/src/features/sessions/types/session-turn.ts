import type {ToolResultMessage, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";

/** One tool call of a turn, as Pi recorded it: the call's name and arguments, and its result once it ran. */
export interface SessionToolCall {
  readonly callId: string;
  /** Pi tool name: `bash`, `read`, `edit`, `write`, `ls`, `find`, `grep`, `web_fetch`, or an extension's tool. */
  readonly name: string;
  /** The call's arguments; absent while the model is still streaming them. */
  readonly arguments: Readonly<Record<string, unknown>> | undefined;
  readonly status: "pending" | "completed" | "error";
  /** Pi's tool result message, once the call finished. */
  readonly result: ToolResultMessage | undefined;
  /** Output the tool has streamed so far while running. */
  readonly output: string | undefined;
}

/** The user-authored message that starts a turn. */
export interface SessionUserMessage {
  readonly id: string;
  /** Authored composer content; image attachments carry their payload from Pi's user message. */
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
  /** Provider or assistant error; set on a content-less event of its own. */
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

/** One user request and the agent activity answering it, projected from Pi's entries for rendering. */
export interface SessionTurn {
  /** The id of the Pi user entry that starts the turn; checkpoint navigation and forks refer to it. */
  readonly id: string;
  readonly status: "completed" | "error" | "streaming";
  readonly userMessage: SessionUserMessage;
  readonly events: readonly SessionTurnEvent[];
  readonly startedAt: string;
  readonly completedAt: string | undefined;
}
