import type {
  AssistantMessage,
  CompactionStatus,
  EntryRecord,
  LiveState,
  PiUserMessage,
  Session,
  SessionEntries,
  SessionEntry,
  ToolCall,
  ToolResultMessage,
  UserMessageContentPart,
} from "@supernova/contracts/services/sessions/schemas";

// Typed by the contracts and Pi: a change to what the server sends stops these compiling, not passing on a stale shape.

/** Pi brands its ids; this and the task-id casts below are the only casts in the builders. */
export function entryId(id: number): EntryRecord["id"] {
  return id as EntryRecord["id"];
}

const CONVERSATION = 1 as EntryRecord["conversationId"];

/** pi-durable's `UserEntry.kind` and so on; the client does not depend on the engine, so it matches the strings. */
const KIND = {user: "pi.user", assistant: "pi.assistant", toolResult: "pi.tool-result", compaction: "pi.compaction"} as const;

const SUMMARY_PREFIX = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const SUMMARY_SUFFIX = "\n</summary>";

const ZERO_USAGE: AssistantMessage["usage"] = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0},
};

export type EntryDraft = Omit<SessionEntry, "conversationId" | "id">;

export function text(value: string): UserMessageContentPart {
  return {text: value, type: "text"};
}

export function toolCall(id: string, name: string, args: ToolCall["arguments"] = {}): ToolCall {
  return {arguments: args, id, name, type: "toolCall"};
}

/** `authored: false` is an extension's continuation, which belongs to the turn before it. */
export function userEntry(
  input: string | {readonly parts?: readonly UserMessageContentPart[]; readonly content?: PiUserMessage["content"]; readonly authored?: boolean}
): EntryDraft {
  const options = typeof input === "string" ? {parts: [text(input)]} : input;
  const parts = options.parts ?? [];
  const content = options.content ?? parts.map((part) => (part.type === "text" ? part.text : part.type === "reference" ? part.value : "")).join("");
  return {
    kind: KIND.user,
    model: [{content, role: "user", timestamp: 0}],
    ...(options.authored === false ? {} : {contentParts: parts}),
  };
}

export function assistantMessage(
  content: string | AssistantMessage["content"],
  options: {readonly stopReason?: AssistantMessage["stopReason"]; readonly errorMessage?: string} = {}
): AssistantMessage {
  return {
    api: "openai-completions",
    content: typeof content === "string" ? [{text: content, type: "text"}] : content,
    model: "test-model",
    provider: "test-provider",
    role: "assistant",
    stopReason: options.stopReason ?? (typeof content !== "string" && content.some((part) => part.type === "toolCall") ? "toolUse" : "stop"),
    timestamp: 0,
    usage: ZERO_USAGE,
    ...(options.errorMessage === undefined ? {} : {errorMessage: options.errorMessage}),
  };
}

export function assistantEntry(content: string | AssistantMessage["content"], options?: Parameters<typeof assistantMessage>[1]): EntryDraft {
  return {kind: KIND.assistant, model: [assistantMessage(content, options)]};
}

export function toolResultEntry(
  callId: string,
  name: string,
  output: string,
  options: {readonly isError?: boolean; readonly details?: ToolResultMessage["details"]} = {}
): EntryDraft {
  const message: ToolResultMessage = {
    content: [{text: output, type: "text"}],
    isError: options.isError ?? false,
    role: "toolResult",
    timestamp: 0,
    toolCallId: callId,
    toolName: name,
    ...(options.details === undefined ? {} : {details: options.details}),
  };
  return {kind: KIND.toolResult, model: [message], data: {diagnostics: []}};
}

export function compactionEntry(summary: string): EntryDraft {
  return {kind: KIND.compaction, model: [{content: `${SUMMARY_PREFIX}${summary}${SUMMARY_SUFFIX}`, role: "user", timestamp: 0}], data: {reason: "manual"}};
}

export function transcript(drafts: readonly EntryDraft[], options: {readonly firstId?: number; readonly startMs?: number} = {}): SessionEntry[] {
  const {firstId = 1, startMs = Date.UTC(2026, 0, 1)} = options;
  return drafts.map((draft, index) => {
    const id = firstId + index;
    const timestamp = startMs + index * 1_000;
    const model = draft.model?.map((message) => ({...message, timestamp}));
    return {...draft, conversationId: CONVERSATION, id: entryId(id), ...(model === undefined ? {} : {model})};
  });
}

export function turnAt(id: number, label = `Turn ${id}`): SessionEntry {
  return transcript([userEntry(label)], {firstId: id})[0]!;
}

type LivePartial = NonNullable<NonNullable<LiveState["generation"]>["message"]>;

type RunTaskId = NonNullable<LiveState["run"]>["taskId"];
type CompactionTaskId = CompactionStatus["taskId"];

export function runningLive(options: {readonly partial?: LivePartial["content"]; readonly compacting?: boolean} = {}): LiveState {
  const message: LivePartial | undefined = options.partial && {
    api: "openai-completions",
    content: options.partial,
    model: "test-model",
    provider: "test-provider",
    role: "assistant",
    stopReason: "stop",
    timestamp: 0,
    usage: ZERO_USAGE,
  };
  return {
    run: {inputs: [], taskId: 1 as RunTaskId},
    ...(message === undefined ? {} : {generation: {attempt: 0, message}}),
    ...(options.compacting ? {compactions: [{attempt: 1, blocking: true, reason: "threshold", taskId: 2 as CompactionTaskId}]} : {}),
  };
}

/** Both pages complete; the undone page follows the last visible entry, as the server's does. */
export function sessionDocument(
  input: Partial<Omit<Session, "entries" | "undone">> & {readonly entries?: readonly SessionEntry[]; readonly undone?: readonly SessionEntry[]} = {}
): Session {
  const {entries = [], undone = [], ...rest} = input;
  return {
    id: "session-1",
    title: "Session",
    forked: false,
    pinned: false,
    projectPath: "/workspace",
    updatedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(),
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    context: {usedTokens: 0, contextWindow: 200_000},
    ...rest,
    entries: page(entries),
    undone: page(undone, undone.length > 0 ? (entries.at(-1)?.id ?? null) : null),
  };
}

export function page(items: readonly SessionEntry[], precedingEntryId: number | null = null, remaining = 0): SessionEntries {
  return {items, remaining, precedingEntryId: precedingEntryId === null ? null : entryId(precedingEntryId)};
}
