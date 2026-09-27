import {afterEach, describe, expect, it} from "vitest";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel} from "@tests/support/session-runtime";

function isSnapshotEvent(event: SessionStreamEvent): event is Extract<SessionStreamEvent, {type: "session.snapshot"}> {
  return event.type === "session.snapshot";
}

describe("manual Pi session compaction", () => {
  const runtimes: Array<{unregister: () => void}> = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
  });

  it("publishes compaction lifecycle events and a refreshed session snapshot", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession();
    pi.appendConversation(manager, {requestText: "Older request", assistantText: "Older response."});
    pi.appendConversation(manager, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Old response."});
    pi.faux.setResponses([fauxAssistantMessage("Manual compacted summary.")]);
    const events = await pi.collectEvents(
      () => pi.sessionRuntime.compact({modelReference: selectedModelReference, sessionId: info.id}),
      (events) => {
        if (!events.some(isSnapshotEvent)) throw new Error("Session snapshot was not published.");
      }
    );

    const finalSnapshot = events.filter(isSnapshotEvent).at(-1);

    expect(events.find((event) => event.type === "session.compaction.started")).toMatchObject({sessionId: info.id, type: "session.compaction.started"});
    expect(events.find((event) => event.type === "session.compaction.ended")).toMatchObject({sessionId: info.id, type: "session.compaction.ended"});
    expect(finalSnapshot?.session.context).toEqual({contextWindow: selectedPiModel.contextWindow, usedTokens: null});
    expect(finalSnapshot?.session.turns.at(-1)?.events).toContainEqual(
      expect.objectContaining({summary: expect.stringContaining("Manual compacted summary."), type: "compaction"})
    );
  });
});
