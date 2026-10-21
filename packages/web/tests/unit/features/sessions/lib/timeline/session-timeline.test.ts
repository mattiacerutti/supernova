import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {describe, expect, it} from "vitest";
import {sessionView} from "@/features/sessions/lib/session-view";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/rows/build-session-timeline";
import {buildSessionTurns, buildTurns} from "@/features/sessions/lib/timeline/turns/build-turns";
import {summarizeWork} from "@/features/sessions/lib/timeline/work/work-summary";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import {assistantEntry, compactionEntry, page, runningLive, sessionDocument, text, toolCall, toolResultEntry, transcript, userEntry} from "@tests/support/session";

function outline(items: readonly SessionTimelineItem[]): unknown[] {
  return items.map((item) => {
    switch (item.type) {
      case "user":
        return {user: item.message.contentParts.map((part) => (part.type === "text" ? part.text : part.name)).join("")};
      case "assistant":
        return {assistant: item.event.content, ...(item.event.error ? {error: item.event.error} : {}), final: item.final};
      case "reasoning":
        return {reasoning: item.event.content};
      case "work":
        return {work: summarizeWork(item.events), tools: item.events.map((event) => `${event.tool.name}:${event.tool.status}`)};
      case "compaction":
        return {compaction: item.event.summary, status: item.event.status};
      case "turn-work":
        return {worked: outline(item.items)};
    }
  });
}

function shown(session: Session) {
  const view = sessionView({entry: undefined, session});
  return {
    committed: outline(buildCommittedTimelineItems(view.turns)),
    live: outline(buildLiveTimelineItems({live: view.liveTurn !== undefined, liveTurn: view.liveTurn ?? null})),
    undone: view.undoneTurns.map((turn) => turn.userMessage.contentParts),
  };
}

describe("a session document as the timeline shows it", () => {
  it("folds a turn's reasoning and tools behind its work, with each tool's outcome, before the answer", () => {
    const entries = transcript([
      userEntry("What is here?"),
      assistantEntry([{thinking: "Look around first.", type: "thinking"}, toolCall("call-1", "bash", {command: "ls"}), toolCall("call-2", "read", {path: "missing.md"})]),
      toolResultEntry("call-1", "bash", "README.md"),
      toolResultEntry("call-2", "read", "ENOENT: missing.md", {isError: true}),
      assistantEntry("There is a readme."),
    ]);

    expect(shown(sessionDocument({entries})).committed).toEqual([
      {user: "What is here?"},
      {worked: [{reasoning: "Look around first."}, {work: "Ran 1 command · read 1 file · 1 failed", tools: ["bash:completed", "read:error"]}]},
      {assistant: "There is a readme.", final: true},
    ]);
  });

  it("shows a provider failure on its own turn, but not a stopped answer", () => {
    const entries = transcript([
      userEntry("First"),
      assistantEntry("First answer."),
      userEntry("Second"),
      assistantEntry("", {errorMessage: "Overloaded", stopReason: "error"}),
      userEntry("Third"),
      assistantEntry("Half", {errorMessage: "Aborted", stopReason: "aborted"}),
    ]);

    expect(shown(sessionDocument({entries})).committed).toEqual([
      {user: "First"},
      {assistant: "First answer.", final: true},
      {user: "Second"},
      {assistant: "", error: "Overloaded", final: true},
      {user: "Third"},
      {assistant: "Half", final: true},
    ]);
  });

  it("keeps an extension's continuation and a compaction inside the turn they happened in", () => {
    const entries = transcript([
      userEntry("First"),
      assistantEntry("One"),
      userEntry({parts: [text("continue")], authored: false}),
      compactionEntry("Summary of the work"),
      assistantEntry("Two"),
    ]);

    expect(shown(sessionDocument({entries})).committed).toEqual([
      {user: "First"},
      {
        worked: [
          {assistant: "One", final: false},
          {compaction: "Summary of the work", status: "completed"},
        ],
      },
      {assistant: "Two", final: true},
    ]);
  });

  it("restores an image's payload from Pi's message onto the attachment the user sent", () => {
    const image = {id: "image-1", kind: "image", mime: "image/png", name: "a.png", size: 1, type: "attachment"} as const;
    const entries = transcript([userEntry({parts: [image], content: [{data: "BASE64", mimeType: "image/png", type: "image"}]}), assistantEntry("A chart.")]);

    expect(sessionView({entry: undefined, session: sessionDocument({entries})}).turns[0]?.userMessage.contentParts).toEqual([{...image, contentBase64: "BASE64"}]);
  });

  it("keeps undone turns out of the timeline and offers them to redo", () => {
    const entries = transcript([userEntry("Keep"), assistantEntry("Kept.")]);
    const undone = transcript([userEntry("Undo me"), assistantEntry("Undone.")], {firstId: 3});

    expect(shown(sessionDocument({entries, undone}))).toEqual({
      committed: [{user: "Keep"}, {assistant: "Kept.", final: true}],
      live: [],
      undone: [[text("Undo me")]],
    });
  });

  it("streams the running turn from its first user entry, hiding the arguments of a call still being written", () => {
    const entries = transcript([userEntry("First"), assistantEntry("Old"), userEntry("Second")]);
    const live = runningLive({
      compacting: true,
      partial: [
        {text: "Stream", type: "text"},
        {arguments: {command: "l"}, id: "call-2", name: "bash", type: "toolCall"},
      ],
    });
    const session = sessionDocument({entries, live, runStart: entries[2]!.id});

    const view = sessionView({entry: undefined, session});
    expect(view.turns.map((turn) => turn.userMessage.contentParts)).toEqual([[text("First")]]);
    expect(view.liveTurn).toMatchObject({
      events: [
        {status: "pending", type: "compaction"},
        {content: "Stream", type: "assistant"},
        {tool: {arguments: undefined, name: "bash", status: "pending"}, type: "tool"},
      ],
      status: "streaming",
      userMessage: {contentParts: [text("Second")]},
    });
  });
});

describe("rebuilding the timeline while a turn streams", () => {
  const history = () => transcript([userEntry("First"), assistantEntry("Old"), userEntry("Second")]);

  it.each([undefined, 3])("reuses settled turns across live-only updates (runStart: %s)", (runStart) => {
    const entries = page(history());
    const before = buildSessionTurns({entries, live: {}, runStart});
    const after = buildSessionTurns({entries: {...entries}, live: runningLive({partial: [{text: "New partial", type: "text"}]}), runStart});

    expect(after.turns, "streaming must not rebuild the settled transcript").toBe(before.turns);
    if (runStart === undefined) expect(after.liveTurn).toBeUndefined();
    else expect(after.liveTurn?.events).toMatchObject([{content: "New partial", type: "assistant"}]);
  });

  it("reuses settled turns when the running turn commits an entry", () => {
    const items = history();
    const before = buildSessionTurns({entries: page(items), live: {}, runStart: 3});
    const after = buildSessionTurns({entries: page([...items, ...transcript([assistantEntry("Step")], {firstId: 4})]), live: {}, runStart: 3});

    expect(after.turns, "a run's entries must not rebuild the transcript before it").toBe(before.turns);
    expect(after.liveTurn?.events).toMatchObject([{content: "Step", type: "assistant"}]);
  });

  it.each(["settlement", "run boundary", "undo", "prepend", "replacement"] as const)("rebuilds settled turns after %s", (change) => {
    const items = history();
    buildSessionTurns({entries: page(items), live: {}, runStart: 3});
    const changed = {
      settlement: items,
      "run boundary": items,
      undo: items.slice(0, 2),
      prepend: [...transcript([userEntry("Earlier")], {firstId: 0}), ...items],
      replacement: [...transcript([userEntry("Edited")]), ...items.slice(1)],
    }[change];
    const runStart = change === "settlement" ? undefined : change === "run boundary" ? 1 : 3;

    const result = buildSessionTurns({entries: page(changed), live: {}, runStart});

    const split = runStart === undefined ? -1 : changed.findIndex((entry) => entry.id >= runStart);
    expect(result.turns).toEqual(buildTurns({entries: split < 0 ? changed : changed.slice(0, split)}));
    expect(result.liveTurn).toEqual(split < 0 ? undefined : buildTurns({entries: changed.slice(split), live: {}}).at(-1));
  });
});
