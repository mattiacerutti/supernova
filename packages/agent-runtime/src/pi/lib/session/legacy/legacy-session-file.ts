import type {Message} from "@earendil-works/pi-ai";
import type {CustomEntry, SessionEntry, SessionHeader} from "@earendil-works/pi-coding-agent";
import {convertToLlm, parseSessionEntries, SessionManager, sessionEntryToContextMessages} from "@earendil-works/pi-coding-agent";
import type {EntryDraft} from "@earendil-works/pi-durable";
import type {SessionWorktree, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {SessionRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

const CONTENT_PARTS_TYPE = "supernova.user-message-content-parts";
const WORKTREE_TYPE = "supernova.worktree";
const FORK_TYPE = "supernova.fork";

export interface LegacyItem {
  readonly index: number;
  readonly draft: EntryDraft;
  readonly headIndex?: number;
  readonly contentParts?: readonly UserMessageContentPart[];
}

export interface LegacySession {
  readonly record: SessionRecord;
  readonly cwd: string;
  readonly model: {readonly provider: string; readonly modelId: string} | undefined;
  readonly thinkingLevel: string;
  readonly items: readonly LegacyItem[];
}

function customData<T>(entries: readonly SessionEntry[], customType: string): T | undefined {
  const entry = entries.find((candidate): candidate is CustomEntry<T> => candidate.type === "custom" && candidate.customType === customType);
  return entry?.data;
}

function textOf(message: Message): string {
  if (typeof message.content === "string") return message.content;
  return message.content.map((part) => (part.type === "text" ? part.text : "")).join(" ");
}

function abortedResult(call: {readonly id: string; readonly name: string}, timestamp: number): LegacyItem["draft"] {
  const message: Message = {
    role: "toolResult",
    toolCallId: call.id,
    toolName: call.name,
    content: [{type: "text", text: `Tool ${call.name} was aborted`}],
    isError: true,
    timestamp,
  };
  return {kind: "pi.tool-result", model: [message], data: {diagnostics: []}};
}

function kindOf(message: Message): string | undefined {
  if (message.role === "user") return "pi.user";
  if (message.role === "assistant") return "pi.assistant";
  if (message.role === "toolResult") return "pi.tool-result";
  return undefined;
}

/** The path from the last entry, where the old checkpoint cursor left it; undone turns are dropped. */
export function readLegacySession(content: string): LegacySession | undefined {
  const fileEntries = parseSessionEntries(content);
  const header = fileEntries.find((entry): entry is SessionHeader => entry.type === "session");
  if (!header || typeof header.id !== "string" || typeof header.cwd !== "string") return undefined;

  // Loading also migrates entries written by older Pi versions, in memory; the file is never written.
  const manager = SessionManager.inMemory(header.cwd, undefined, fileEntries);
  const entries = manager.getEntries();
  const branch = manager.getBranch();
  const branchIndex = new Map(branch.map((entry, index) => [entry.id, index]));
  const {model, thinkingLevel} = manager.buildSessionContext();

  const items: LegacyItem[] = [];
  let pendingParts: readonly UserMessageContentPart[] | undefined;
  // Calls of the latest assistant message still waiting for a result; a crash mid-tool left some unanswered.
  let openCalls = new Map<string, {readonly id: string; readonly name: string; readonly timestamp: number}>();
  const closeCalls = (index: number) => {
    for (const call of openCalls.values()) items.push({index, draft: abortedResult(call, call.timestamp)});
    openCalls = new Map();
  };
  for (const [index, entry] of branch.entries()) {
    if (entry.type === "custom" && entry.customType === CONTENT_PARTS_TYPE) {
      pendingParts = (entry.data as {readonly contentParts?: readonly UserMessageContentPart[]} | undefined)?.contentParts;
      continue;
    }
    const messages = convertToLlm(sessionEntryToContextMessages(entry)).filter((message) => kindOf(message) !== undefined);
    if (entry.type === "compaction") {
      items.push({index, headIndex: branchIndex.get(entry.firstKeptEntryId), draft: {kind: "pi.compaction", model: messages, data: {reason: "threshold"}}});
      continue;
    }
    // As the old timeline did, a user message is a turn only when the composer's content precedes it.
    const isComposerMessage = entry.type === "message" && entry.message.role === "user" && (pendingParts?.length ?? 0) > 0;
    for (const message of messages) {
      const kind = kindOf(message)!;
      if (message.role === "toolResult") openCalls.delete(message.toolCallId);
      else closeCalls(index);
      // An errored or aborted message is never replayed to the model, so its calls get no result either.
      if (message.role === "assistant" && message.stopReason !== "error" && message.stopReason !== "aborted") {
        for (const part of message.content) if (part.type === "toolCall") openCalls.set(part.id, {id: part.id, name: part.name, timestamp: message.timestamp});
      }
      items.push({
        index,
        draft: {kind, model: [message], ...(kind === "pi.tool-result" ? {data: {diagnostics: []}} : {})},
        ...(isComposerMessage ? {contentParts: pendingParts} : {}),
      });
    }
    if (isComposerMessage) pendingParts = undefined;
  }
  closeCalls(branch.length);

  const worktree = customData<{readonly projectPath: string; readonly worktree: SessionWorktree}>(entries, WORKTREE_TYPE);
  const forkedFrom = customData<{readonly sourceSessionId: string}>(entries, FORK_TYPE)?.sourceSessionId ?? header.parentSession;
  const firstUser = items.find((item) => item.draft.kind === "pi.user" && item.contentParts)?.draft.model?.[0];
  // The old sidebar showed the first user message when a session had no name.
  const title = manager.getSessionName() ?? (firstUser ? textOf(firstUser).trim() || undefined : undefined);
  const lastActivity = branch.reduce(
    (latest, entry) => (entry.type === "message" && typeof entry.message.timestamp === "number" ? Math.max(latest, entry.message.timestamp) : latest),
    0
  );
  const createdAt = new Date(header.timestamp).toISOString();

  const projectPath = worktree?.projectPath ?? header.cwd;
  return {
    record: {
      id: header.id,
      projectPath,
      ...(worktree ? {worktree: worktree.worktree} : {}),
      ...(title ? {title} : {}),
      // Only its presence is read: it marks the session as a fork.
      ...(forkedFrom ? {forkedFrom} : {}),
      pinned: false,
      createdAt,
      updatedAt: lastActivity > 0 ? new Date(lastActivity).toISOString() : createdAt,
    },
    cwd: worktree?.worktree.path ?? projectPath,
    model: model ?? undefined,
    thinkingLevel,
    items,
  };
}
