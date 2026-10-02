import {afterEach, describe, expect, it} from "vitest";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel} from "@tests/support/session-runtime";

function isSnapshotEvent(event: SessionStreamEvent): event is Extract<SessionStreamEvent, {type: "session.snapshot"}> {
  return event.type === "session.snapshot";
}

describe("manual Pi session compaction", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
  });

  it("publishes compaction lifecycle events and a refreshed session snapshot", async () => {
    // Seeded without automatic compaction, so the large exchange stays until the manual compaction.
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false}}});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {requestText: "Older request", assistantText: "Older response."});
    await pi.appendConversation(info.id, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Old response."});
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
