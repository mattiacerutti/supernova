import {afterEach, describe, expect, it} from "vitest";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel} from "@tests/support/session-runtime";

describe("manual Pi session compaction", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
  });

  it("streams the manual compaction as compacting state and commits its summary", async () => {
    // Seeded without automatic compaction, so the large exchange stays until the manual compaction.
    const pi = await createPiTestRuntime({settings: {compaction: {enabled: false}}});
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id, {requestText: "Older request", assistantText: "Older response."});
    await pi.appendConversation(info.id, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Old response."});
    pi.faux.setResponses([fauxAssistantMessage("Manual compacted summary.")]);
    const observation = await pi.observeWhile(
      info.id,
      () => pi.sessionRuntime.compact({modelReference: selectedModelReference, sessionId: info.id}),
      (seen) => {
        const activities = seen.board.map((value) => value.sessions[info.id]?.activity);
        if (activities.at(-1) !== "idle" || !activities.includes("compacting")) throw new Error("Compaction has not settled.");
      }
    );
    const final = observation.versions.at(-1)!;

    expect(final).toEqual(await pi.sessions.get({sessionId: info.id}));
    expect(final.context).toEqual({contextWindow: selectedPiModel.contextWindow, usedTokens: null});
    expect(final.entries.at(-1)).toMatchObject({kind: "pi.compaction"});
    expect(JSON.stringify(final.entries.at(-1))).toContain("Manual compacted summary.");
  });
});
