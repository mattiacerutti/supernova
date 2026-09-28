import {afterEach, describe, expect, it, vi} from "vitest";
import type {SessionStreamEvent} from "@supernova/contracts/session-runtime/procedures";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, waitUntil} from "@tests/support/session-runtime";

function snapshots(events: readonly SessionStreamEvent[]) {
  return events.filter((event): event is Extract<SessionStreamEvent, {type: "session.snapshot"}> => event.type === "session.snapshot");
}

describe("reloading extensions in retained sessions", () => {
  const runtimes: Array<{unregister: () => void}> = [];

  afterEach(() => {
    while (runtimes.length > 0) runtimes.pop()?.unregister();
  });

  it("rebuilds an idle session at its next message and continues the conversation", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const createAgentSession = vi.spyOn(pi.agentSessionFactory, "createAgentSession");
    const {info, manager} = pi.createSession();
    pi.appendConversation(manager);
    pi.faux.setResponses([fauxAssistantMessage("First."), fauxAssistantMessage("Second.")]);

    const first = await pi.sendMessage({message: "One", modelReference: selectedModelReference, sessionId: info.id});
    pi.sessionRuntime.reloadExtensions();
    const second = await pi.sendMessage({message: "Two", modelReference: selectedModelReference, sessionId: info.id});

    expect(createAgentSession).toHaveBeenCalledTimes(2);
    expect(
      snapshots(second)
        .at(-1)
        ?.session.turns.map((turn) => turn.userMessage.contentParts)
    ).toEqual([[{text: "Existing request", type: "text"}], [{text: "One", type: "text"}], [{text: "Two", type: "text"}]]);
    // Revisions keep increasing on the same worker, so connected clients don't drop the new events as stale.
    expect(Math.min(...second.flatMap((event) => ("revision" in event ? [event.revision] : [])))).toBeGreaterThan(
      Math.max(...first.flatMap((event) => ("revision" in event ? [event.revision] : [])))
    );
  });

  it("lets an active turn finish on its loaded extensions and reloads at the following message", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const createAgentSession = vi.spyOn(pi.agentSessionFactory, "createAgentSession");
    const {info, manager} = pi.createSession();
    pi.appendConversation(manager);
    let releaseProvider: (() => void) | undefined;
    const providerStarted = new Promise<void>((resolve) => {
      pi.faux.setResponses([
        async () => {
          resolve();
          await new Promise<void>((release) => {
            releaseProvider = release;
          });
          return fauxAssistantMessage("Finished.");
        },
        fauxAssistantMessage("After reload."),
      ]);
    });

    const {events, stop} = await pi.watchEvents();
    try {
      await pi.sessionRuntime.sendMessage({contentParts: [{text: "Long task", type: "text"}], modelReference: selectedModelReference, sessionId: info.id});
      await providerStarted;
      pi.sessionRuntime.reloadExtensions();
      releaseProvider?.();
      await waitUntil(() => expect(snapshots(events).at(-1)?.session.turns).toHaveLength(2));
      await waitUntil(() => expect(pi.sessionRuntime.getCommittedSession({sessionId: info.id})).toBeUndefined());
    } finally {
      releaseProvider?.();
      await stop();
    }
    expect(events.some((event) => event.type === "session.error")).toBe(false);
    expect(createAgentSession).toHaveBeenCalledTimes(1);

    await pi.sendMessage({message: "Next", modelReference: selectedModelReference, sessionId: info.id});
    expect(createAgentSession).toHaveBeenCalledTimes(2);
  });
});
