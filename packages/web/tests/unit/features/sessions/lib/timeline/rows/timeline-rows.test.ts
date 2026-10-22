import {describe, expect, it} from "vitest";
import {sessionView} from "@/features/sessions/lib/session-view";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/rows/build-session-timeline";
import {buildTimelineRowKeys, buildTimelineRows} from "@/features/sessions/lib/timeline/rows/timeline-rows";
import {assistantEntry, runningLive, sessionDocument, toolCall, toolResultEntry, transcript, userEntry} from "@tests/support/session";

const EARLIER_TURNS = 3;

function timeline(live: boolean) {
  const entries = transcript([
    userEntry("First"),
    assistantEntry([{thinking: "Look first.", type: "thinking"}, toolCall("call-1", "bash", {command: "ls"})]),
    toolResultEntry("call-1", "bash", "README.md"),
    assistantEntry("One"),
    userEntry("Second"),
  ]);
  const session = live ? sessionDocument({entries, live: runningLive({partial: [{text: "Streaming", type: "text"}]}), runStart: entries[4]!.id}) : sessionDocument({entries});
  const view = sessionView({entry: undefined, session});
  return {history: buildCommittedTimelineItems(view.turns), live: buildLiveTimelineItems({live, liveTurn: view.liveTurn ?? null})};
}

describe("timeline row keys", () => {
  // The timeline keys loaded history once and the rows after it on every render, continuing from the history's turns.
  it.each([
    {name: "a streaming turn", live: true, streamError: null},
    {name: "a streaming turn that failed", live: true, streamError: "Failed"},
    {name: "a failure after the last settled turn", live: false, streamError: "Failed"},
  ])("keys the rows after the history as one pass would: $name", ({live, streamError}) => {
    const {history, live: liveItems} = timeline(live);
    const rows = buildTimelineRows({items: history, liveItems, streamError});
    const historyTurns = history.filter((item) => item.type === "user").length;

    const continued = [...buildTimelineRowKeys(history, EARLIER_TURNS), ...buildTimelineRowKeys(rows.slice(history.length), EARLIER_TURNS + historyTurns)];

    expect(rows.length).toBeGreaterThan(history.length);
    expect(continued).toEqual(buildTimelineRowKeys(rows, EARLIER_TURNS));
  });
});
