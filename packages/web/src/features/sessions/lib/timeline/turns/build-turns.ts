import type {
  AssistantMessage,
  EntryRecord,
  ImageContent,
  LiveState,
  PiUserMessage,
  Session,
  ToolResultMessage,
  UserMessageContentPart,
} from "@supernova/contracts/services/sessions/schemas";
import type {SessionToolCall, SessionTurn, SessionTurnEvent, SessionUserMessage} from "@/features/sessions/types/session-turn";

/** Pi wraps compaction summaries for the model; the timeline shows the summary itself. */
const SUMMARY_PREFIX = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const SUMMARY_SUFFIX = "\n</summary>";

function isoTimestamp(milliseconds: number | undefined): string {
  return new Date(milliseconds ?? 0).toISOString();
}

function textOf(content: PiUserMessage["content"] | ToolResultMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function compactionSummary(entry: EntryRecord): string {
  const message = entry.model?.[0];
  const text = message?.role === "user" ? textOf(message.content) : "";
  return text.startsWith(SUMMARY_PREFIX) && text.endsWith(SUMMARY_SUFFIX) ? text.slice(SUMMARY_PREFIX.length, -SUMMARY_SUFFIX.length) : text;
}

/** Authored image attachments are stored without payload; Pi's user message holds the images, in order. */
function withImages(contentParts: readonly UserMessageContentPart[], message: PiUserMessage): readonly UserMessageContentPart[] {
  if (typeof message.content === "string") return contentParts;
  const images = message.content.filter((part): part is ImageContent => part.type === "image");
  let imageIndex = 0;
  return contentParts.map((part) => {
    if (part.type !== "attachment" || part.kind !== "image") return part;
    const image = images[imageIndex++];
    return image ? {...part, contentBase64: image.data} : part;
  });
}

/** Collects the events of one turn. Event ids are positions in the turn, so a partial and its entry share them. */
class TurnDraft {
  private readonly events: SessionTurnEvent[] = [];
  private readonly toolIndexes = new Map<string, number>();
  private failed = false;

  public constructor(private readonly userMessage: SessionUserMessage) {}

  /** Appends reasoning, text, tool calls, and an assistant error. `incompleteLastCall` hides streaming arguments. */
  public addAssistant(message: AssistantMessage, incompleteLastCall = false): void {
    const timestamp = isoTimestamp(message.timestamp);
    const error = message.stopReason === "aborted" ? undefined : message.errorMessage;
    const lastCall = incompleteLastCall ? message.content.findLastIndex((part) => part.type === "toolCall") : -1;
    for (const [index, part] of message.content.entries()) {
      if (part.type === "thinking" && part.thinking.length > 0) this.push({type: "reasoning", content: part.thinking, timestamp});
      if (part.type === "text" && part.text.length > 0) this.push({type: "assistant", content: part.text, timestamp});
      if (part.type === "toolCall") {
        const tool: SessionToolCall = {
          callId: part.id,
          name: part.name,
          arguments: index === lastCall ? undefined : part.arguments,
          status: "pending",
          result: undefined,
          output: undefined,
        };
        this.toolIndexes.set(part.id, this.events.length);
        this.push({type: "tool", timestamp, tool});
      }
    }
    if (error) {
      this.failed = true;
      this.push({type: "assistant", content: "", error, timestamp});
    }
  }

  /** Completes the call's event, or appends an orphan result. */
  public addToolResult(message: ToolResultMessage): void {
    const timestamp = isoTimestamp(message.timestamp);
    const status = message.isError ? "error" : "completed";
    if (message.isError) this.failed = true;
    const index = this.toolIndexes.get(message.toolCallId);
    const call = index === undefined ? undefined : this.events[index];
    if (call?.type !== "tool") {
      this.push({type: "tool", timestamp, tool: {callId: message.toolCallId, name: message.toolName, arguments: undefined, status, result: message, output: undefined}});
      return;
    }
    this.events[index!] = {...call, durationMs: Date.parse(timestamp) - Date.parse(call.timestamp), tool: {...call.tool, status, result: message}};
  }

  /** Shows what a running call has streamed. */
  public addToolOutput(callId: string, output: string): void {
    const index = this.toolIndexes.get(callId);
    const call = index === undefined ? undefined : this.events[index];
    if (call?.type === "tool" && call.tool.status === "pending") this.events[index!] = {...call, tool: {...call.tool, output}};
  }

  /** A summary, or a compaction still running when `summary` is undefined. */
  public addCompaction(timestamp: string, summary: string | undefined): void {
    this.push(summary === undefined ? {type: "compaction", status: "pending", timestamp} : {type: "compaction", status: "completed", summary, timestamp});
  }

  public toTurn(streaming: boolean): SessionTurn {
    return {
      id: this.userMessage.id,
      status: this.failed ? "error" : streaming ? "streaming" : "completed",
      userMessage: this.userMessage,
      events: [...this.events],
      startedAt: this.userMessage.timestamp,
      completedAt: this.events.at(-1)?.timestamp,
    };
  }

  private push(event: DistributiveOmit<SessionTurnEvent, "id">): void {
    this.events.push({...event, id: `${this.userMessage.id}:${this.events.length}`} as SessionTurnEvent);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** The live presentation Pi streams for the turn being answered: running tool output, compactions, the partial. */
function addLive(draft: TurnDraft, live: LiveState): void {
  for (const slot of live.tools ?? []) {
    if (slot.status === "running" && slot.output !== undefined) draft.addToolOutput(slot.callId, slot.output);
  }
  // Background compactions never block the answer; only blocking ones and a manual one show.
  for (const compaction of live.compactions ?? []) {
    if (compaction.blocking || compaction.reason === "manual") draft.addCompaction(new Date().toISOString(), undefined);
  }
  const partial = live.generation?.message as AssistantMessage | undefined;
  if (partial) draft.addAssistant(partial, true);
}

interface BuildTurnsInput {
  readonly entries: readonly EntryRecord[];
  readonly turns: Session["turns"];
  /** Set for the turn being answered: its live presentation follows its entries and it is streaming. */
  readonly live?: LiveState;
}

/**
 * Projects Pi entries onto turns. A user entry with a turn record starts a turn; one without (an extension's
 * continuation) is not shown, and what follows it folds into the current turn. Entries before the first turn have no
 * turn, except compactions, which open the next one.
 */
export function buildTurns(input: BuildTurnsInput): SessionTurn[] {
  const {entries, live, turns} = input;
  const result: SessionTurn[] = [];
  let current: TurnDraft | undefined;
  const pendingCompactions: EntryRecord[] = [];

  for (const entry of entries) {
    const message = entry.model?.[0];
    if (entry.kind === "pi.user" && message?.role === "user") {
      const record = turns[String(entry.id)];
      if (!record) continue;
      if (current) result.push(current.toTurn(false));
      current = new TurnDraft({id: String(entry.id), contentParts: withImages(record.contentParts, message), timestamp: isoTimestamp(message.timestamp)});
      for (const compaction of pendingCompactions.splice(0)) current.addCompaction(isoTimestamp(compaction.model?.[0]?.timestamp), compactionSummary(compaction));
    } else if (entry.kind === "pi.compaction") {
      if (current) current.addCompaction(isoTimestamp(message?.timestamp), compactionSummary(entry));
      else pendingCompactions.push(entry);
    } else if (entry.kind === "pi.assistant" && message?.role === "assistant") {
      current?.addAssistant(message);
    } else if (entry.kind === "pi.tool-result" && message?.role === "toolResult") {
      current?.addToolResult(message);
    }
  }

  if (current && live) addLive(current, live);
  if (current) result.push(current.toTurn(live !== undefined));
  return result;
}

/** The session's committed turns, and the turn its active run is answering: entries from the run's first user entry on. */
export function buildSessionTurns(session: Pick<Session, "entries" | "live" | "runStart" | "turns">): {readonly turns: SessionTurn[]; readonly liveTurn: SessionTurn | undefined} {
  const {entries, live, runStart, turns} = session;
  const start = runStart === undefined ? -1 : entries.findIndex((entry) => entry.id >= runStart);
  if (start === -1) return {turns: buildTurns({entries, turns}), liveTurn: undefined};
  return {turns: buildTurns({entries: entries.slice(0, start), turns}), liveTurn: buildTurns({entries: entries.slice(start), turns, live}).at(-1)};
}
