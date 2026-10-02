import type {AssistantMessage, ToolResultMessage} from "@earendil-works/pi-ai";
import type {EntryRecord, LiveState} from "@earendil-works/pi-durable";
import type {ModelReference, Turn} from "@supernova/contracts/sessions/schemas";
import type {TimelineEntry} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import {buildTurns} from "@supernova/agent-runtime/pi/lib/turns/build-turns";
import type {TurnRecord} from "@supernova/agent-runtime/pi/lib/session/session-state";
import {toTimelineEntries} from "@supernova/agent-runtime/pi/lib/turns/entry-timeline";

/** Partial tool arguments stay hidden until the call is complete: the last call of a streaming partial may be cut. */
function hideIncompleteToolArguments(message: AssistantMessage): AssistantMessage {
  const last = message.content.findLastIndex((part) => part.type === "toolCall");
  return {...message, content: message.content.map((part, index) => (part.type === "toolCall" && index === last ? {...part, arguments: {}} : part))};
}

/** What `pi.live` streams, as timeline entries after the run's committed entries. */
function liveEntries(live: LiveState, runStart: number): TimelineEntry[] {
  const result: TimelineEntry[] = [];
  const now = new Date().toISOString();
  // Running output shows as a streaming result of its call, which is already a committed assistant entry.
  for (const slot of live.tools ?? []) {
    if (slot.status !== "running" || slot.output === undefined) continue;
    const message = {
      role: "toolResult",
      toolCallId: slot.callId,
      toolName: slot.name,
      content: [{type: "text", text: slot.output}],
      details: slot.details,
      isError: false,
      timestamp: Date.now(),
    } as ToolResultMessage;
    result.push({type: "tool-result", id: `live-tool:${slot.callId}`, timestamp: now, message});
  }
  for (const compaction of live.compactions ?? []) {
    // A background compaction never blocks the answer and is off (see settings.ts); only blocking ones show.
    if (compaction.blocking) result.push({type: "compaction", id: `live-compaction:${compaction.taskId}`, timestamp: now, summary: undefined});
  }
  const partial = live.generation?.message as AssistantMessage | undefined;
  if (partial) {
    const message = hideIncompleteToolArguments(partial);
    result.push({
      type: "assistant",
      id: `live-generation:${runStart}:${live.generation?.attempt ?? 0}`,
      timestamp: new Date(message.timestamp || Date.now()).toISOString(),
      message,
    });
  }
  return result;
}

/**
 * The running turn: the run's committed entries plus what `pi.live` streams. `runEntries` start at the run's first
 * user entry and come from the full history, because a compaction mid-run moves the active context past them.
 */
export function buildLiveTurn(input: {
  readonly live: LiveState | undefined;
  readonly modelReference: ModelReference;
  readonly runEntries: readonly EntryRecord[];
  readonly runStart: number;
  readonly turns: Readonly<Record<string, TurnRecord>>;
}): Turn | undefined {
  const {live, modelReference, runEntries, runStart, turns} = input;
  const timeline = [...toTimelineEntries(runEntries, turns), ...(live ? liveEntries(live, runStart) : [])];
  const turn = buildTurns(timeline, modelReference).at(-1);
  return turn ? {...turn, status: turn.status === "error" ? "error" : "streaming"} : undefined;
}
