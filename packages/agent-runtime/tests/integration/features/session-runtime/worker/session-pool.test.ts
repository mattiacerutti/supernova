import {afterEach, describe, expect, it} from "vitest";
import {createPiTestRuntime, fauxAssistantMessage, selectedModelReference, turnContents} from "@tests/support/session-runtime";

describe("reloading extensions in open sessions", () => {
  const runtimes: Array<{unregister: () => Promise<void>}> = [];

  afterEach(async () => {
    while (runtimes.length > 0) await runtimes.pop()?.unregister();
  });

  it("reloads resources of an idle session and continues the conversation", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id);
    pi.faux.setResponses([fauxAssistantMessage("First."), fauxAssistantMessage("Second.")]);

    const first = await pi.sendMessage({message: "One", modelReference: selectedModelReference, sessionId: info.id});
    const loadsBefore = pi.loadCount;
    await pi.sessionRuntime.reloadExtensions();
    const second = await pi.sendMessage({message: "Two", modelReference: selectedModelReference, sessionId: info.id});

    expect(pi.loadCount).toBe(loadsBefore + 1);
    expect(turnContents(second.session)).toEqual([[{text: "Existing request", type: "text"}], [{text: "One", type: "text"}], [{text: "Two", type: "text"}]]);
    // Revisions keep increasing on the same worker, so connected clients don't drop the new events as stale.
    expect(Math.min(...second.events.flatMap((event) => ("revision" in event ? [event.revision] : [])))).toBeGreaterThan(
      Math.max(...first.events.flatMap((event) => ("revision" in event ? [event.revision] : [])))
    );
    expect(second.versions.at(-1)).toEqual(second.session);
  });

  it("lets an active turn finish while extensions reload", async () => {
    const pi = await createPiTestRuntime();
    runtimes.push(pi);
    const {info} = await pi.createSession();
    await pi.appendConversation(info.id);
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
      await pi.sessionRuntime.reloadExtensions();
      releaseProvider?.();
      await pi.settled(info.id);
    } finally {
      releaseProvider?.();
      await stop();
    }
    expect(events.some((event) => event.type === "session.error")).toBe(false);

    const next = await pi.sendMessage({message: "Next", modelReference: selectedModelReference, sessionId: info.id});
    expect(turnContents(next.session)).toHaveLength(3);
  });
});
