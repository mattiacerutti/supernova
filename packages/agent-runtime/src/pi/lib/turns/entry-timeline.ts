import type {AssistantMessage, ToolResultMessage, UserMessage} from "@earendil-works/pi-ai";
import type {EntryRecord} from "@earendil-works/pi-durable";
import type {TimelineEntry} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import type {TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";

/** The engine wraps compaction summaries for the model; the timeline shows the summary itself. */
const SUMMARY_PREFIX = "The conversation history before this point was compacted into the following summary:\n\n<summary>\n";
const SUMMARY_SUFFIX = "\n</summary>";

function isoTimestamp(milliseconds: number | undefined): string {
  return new Date(milliseconds ?? 0).toISOString();
}

function compactionSummary(message: UserMessage | undefined): string {
  const content = message?.content;
  const text = typeof content === "string" ? content : (content ?? []).map((part) => (part.type === "text" ? part.text : "")).join("");
  return text.startsWith(SUMMARY_PREFIX) && text.endsWith(SUMMARY_SUFFIX) ? text.slice(SUMMARY_PREFIX.length, -SUMMARY_SUFFIX.length) : text;
}

/**
 * Maps one engine entry onto the timeline. A user entry with a turn record is preceded by its authored content parts,
 * which start the turn; one without (an extension's continuation) folds into the current turn. System prompt
 * changes, resets, and unknown kinds have no timeline row.
 */
function toTimeline(entry: EntryRecord, turns: Readonly<Record<string, TurnRecord>>): TimelineEntry[] {
  const id = String(entry.id);
  const message = entry.model?.[0];
  const timestamp = isoTimestamp(message?.timestamp);
  switch (entry.kind) {
    case "pi.user": {
      if (message?.role !== "user") return [];
      const turn = turns[id];
      const user: TimelineEntry = {type: "user", id, timestamp, message};
      return turn ? [{type: "content-parts", id: `${id}:parts`, timestamp, contentParts: turn.contentParts}, user] : [user];
    }
    case "pi.assistant":
      return message?.role === "assistant" ? [{type: "assistant", id, timestamp, message: message as AssistantMessage}] : [];
    case "pi.tool-result":
      return message?.role === "toolResult" ? [{type: "tool-result", id, timestamp, message: message as ToolResultMessage}] : [];
    case "pi.compaction":
      return [{type: "compaction", id, timestamp, summary: compactionSummary(message?.role === "user" ? message : undefined)}];
    default:
      return [];
  }
}

/** Maps engine entries in transcript order. */
export function toTimelineEntries(entries: readonly EntryRecord[], turns: Readonly<Record<string, TurnRecord>>): TimelineEntry[] {
  return entries.flatMap((entry) => toTimeline(entry, turns));
}
