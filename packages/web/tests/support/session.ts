import type {ListedSession} from "@supernova/contracts/services/sessions/services";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";
import {USER_ENTRY_KIND, userEntryData} from "@supernova/contracts/services/chat/schemas";
import type {
  AssistantMessage,
  CompactionStatus,
  EntryRecord,
  LiveState,
  PiUserMessage,
  ChatEntries,
  ChatEntry,
  ToolCall,
  ToolResultMessage,
  UserMessageContentPart,
} from "@supernova/contracts/services/chat/schemas";

// Typed by the contracts and Pi: a change to what the server sends stops these compiling, not passing on a stale shape.

export function entryId(id: number): EntryRecord["id"] {
  return id as EntryRecord["id"];
}

const CONVERSATION = 1 as EntryRecord["conversationId"];

const KIND = {user: USER_ENTRY_KIND, continuation: "pi.user", assistant: "pi.assistant", toolResult: "pi.tool-result", compaction: "pi.compaction"} as const;

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

export type EntryDraft = Omit<ChatEntry, "conversationId" | "id">;

export function text(value: string): UserMessageContentPart {
  return {text: value, type: "text"};
}

export function toolCall(id: string, name: string, args: ToolCall["arguments"] = {}): ToolCall {
  return {arguments: args, id, name, type: "toolCall"};
}

/** A turn's user entry; `authored: false` is Pi's own user entry, such as an extension's continuation. */
export function userEntry(
  input: string | {readonly parts?: readonly UserMessageContentPart[]; readonly content?: PiUserMessage["content"]; readonly authored?: boolean}
): EntryDraft {
  const options = typeof input === "string" ? {parts: [text(input)]} : input;
  const parts = options.parts ?? [];
  const content = options.content ?? parts.map((part) => (part.type === "text" ? part.text : part.type === "reference" ? part.value : "")).join("");
  const model = [{content, role: "user", timestamp: 0}] as const;
  // The client never reads the turn's index.
  return options.authored === false ? {kind: KIND.continuation, model} : {kind: KIND.user, model, data: {contentParts: [...parts], turnIndex: 0}};
}

export function isTurnEntry(entry: ChatEntry): boolean {
  return userEntryData(entry) !== undefined;
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

export function transcript(drafts: readonly EntryDraft[], options: {readonly firstId?: number; readonly startMs?: number} = {}): ChatEntry[] {
  const {firstId = 1, startMs = Date.UTC(2026, 0, 1)} = options;
  return drafts.map((draft, index) => {
    const id = firstId + index;
    const timestamp = startMs + index * 1_000;
    const model = draft.model?.map((message) => ({...message, timestamp}));
    return {...draft, conversationId: CONVERSATION, id: entryId(id), ...(model === undefined ? {} : {model})};
  });
}

export function turnAt(id: number, label = `Turn ${id}`): ChatEntry {
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
    run: {inputs: [], taskId: 1 as RunTaskId, turns: 0},
    ...(message === undefined ? {} : {generation: {attempt: 0, message}}),
    ...(options.compacting ? {compactions: [{attempt: 1, blocking: true, trigger: "threshold", taskId: 2 as CompactionTaskId}]} : {}),
  };
}

export function sessionDocument(
  input: Partial<Omit<ChatDocument, "entries" | "undone">> & {readonly entries?: readonly ChatEntry[]; readonly undone?: readonly ChatEntry[]} = {}
): ChatDocument {
  const {entries = [], undone = [], ...rest} = input;
  return {
    id: "session-1",
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    context: {usedTokens: 0, contextWindow: 200_000},
    ...rest,
    entries: page(entries),
    undone: page(undone, undone.length > 0 ? (entries.at(-1)?.id ?? null) : null),
  };
}

export function page(items: readonly ChatEntry[], precedingEntryId: number | null = null, remaining = 0): ChatEntries {
  return {items: [...items], remaining, precedingEntryId: precedingEntryId === null ? null : entryId(precedingEntryId)};
}

export function sessionRecord(input: Partial<ListedSession> = {}): ListedSession {
  return {id: "session-1", title: "Session", forked: false, pinned: false, projectPath: "/workspace", updatedAt: new Date(Date.UTC(2026, 0, 1)).toISOString(), ...input};
}
