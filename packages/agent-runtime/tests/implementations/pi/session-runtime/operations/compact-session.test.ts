import {Effect, Fiber, Stream} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {SessionRuntimeService} from "@supernova/agent-runtime/services/session-runtime/session-runtime-service";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, selectedPiModel, waitUntil} from "@tests/implementations/pi/pi-session-test-utils";

function isSnapshotEvent(event: SessionStreamEvent): event is Extract<SessionStreamEvent, {type: "session.snapshot"}> {
  return event.type === "session.snapshot";
}

describe("manual Pi session compaction", () => {
  const runtimes: Array<{unregister: () => void}> = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
  });

  it("publishes compaction lifecycle events and a refreshed session snapshot", async () => {
    const pi = createPiTestRuntime();
    runtimes.push(pi);
    const {info, manager} = pi.createSession();
    pi.appendConversation(manager, {requestText: "x".repeat(selectedPiModel.contextWindow * 4), assistantText: "Old response."});
    pi.faux.setResponses([fauxAssistantMessage("Manual compacted summary.")]);
    const events: SessionStreamEvent[] = [];
    const watcher = pi.runtime.runFork(
      Effect.gen(function* () {
        const sessionRuntime = yield* SessionRuntimeService;
        yield* Stream.runForEach(sessionRuntime.watchEvents(), (event) => Effect.sync(() => events.push(event)));
      })
    );
    await waitUntil(() => {
      if (!events.some((event) => event.type === "connected")) throw new Error("Stream did not connect.");
    });

    await pi.runWithSessionRuntime(
      Effect.gen(function* () {
        const sessionRuntime = yield* SessionRuntimeService;
        yield* sessionRuntime.compactSession({model: selectedModelReference, sessionId: info.id});
      })
    );
    await waitUntil(() => {
      if (!events.some(isSnapshotEvent)) throw new Error("Session snapshot was not published.");
    });
    await pi.runtime.runPromise(Fiber.interrupt(watcher).pipe(Effect.ignore));

    const finalSnapshot = events.filter(isSnapshotEvent).at(-1);

    expect(events.find((event) => event.type === "session.compaction.started")).toMatchObject({sessionId: info.id, type: "session.compaction.started"});
    expect(events.find((event) => event.type === "session.compaction.ended")).toMatchObject({sessionId: info.id, type: "session.compaction.ended"});
    expect(finalSnapshot?.session.turns.at(-1)?.events).toContainEqual(expect.objectContaining({summary: "Manual compacted summary.", type: "compaction"}));
  });
});
