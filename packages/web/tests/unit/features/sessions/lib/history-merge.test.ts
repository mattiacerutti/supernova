import type {HistorySide} from "@supernova/contracts/services/chat/procedures";
import type {ChatDocument, ChatEntries} from "@supernova/contracts/services/chat/schemas";
import {describe, expect, it} from "vitest";
import {withHistoryPage, withKnownBranch} from "@/features/sessions/lib/history-merge";
import {sessionView} from "@/features/sessions/lib/session-view";
import {assistantEntry, page, runningLive, sessionDocument, transcript, turnAt} from "@tests/support/session";

function session(input?: Partial<ChatDocument>): ChatDocument {
  return {...sessionDocument(), updatedAt: "2026-01-01T00:00:00.000Z", ...input};
}

function live(document: ChatDocument) {
  const view = sessionView({entry: undefined, record: undefined, session: document});
  return {...view, turnIds: view.turns.map((turn) => turn.id)};
}

// One session's document as a client holds it: each published value merged in, and pages added on request.
let current: ChatDocument | undefined;

function reset(): void {
  current = undefined;
}

function held() {
  reset();
  return {
    document: (): ChatDocument => current!,
    setDocument: (next: ChatDocument): void => void (current = withKnownBranch(current, next)),
    addHistoryPage: (_sessionId: string, side: HistorySide, edge: number, entries: ChatEntries): void => void (current = withHistoryPage(current!, side, edge, entries)),
  };
}

describe("history merge", () => {
  it("keeps the branch it has seen as the document's window moves, and drops it when history restarts", () => {
    const {addHistoryPage, document, setDocument} = held();
    const shown = () => document().entries.items.map((item) => item.id);
    const undone = () => document().undone.items.map((item) => item.id);
    setDocument(session({entries: page([turnAt(5), turnAt(7)], 3, 2)}));

    // A page that no longer ends at the first entry is dropped.
    addHistoryPage("session-1", "entries", 3, page([turnAt(1)]));
    expect(shown()).toEqual([5, 7]);
    addHistoryPage("session-1", "entries", 5, page([turnAt(1), turnAt(3)]));
    expect(shown()).toEqual([1, 3, 5, 7]);
    expect(document().entries.precedingEntryId).toBeNull();

    // A new turn slides the window past turn 5; what came before stays.
    setDocument(session({entries: page([turnAt(7), turnAt(9)], 5, 3)}));
    expect(shown()).toEqual([1, 3, 5, 7, 9]);
    expect(document().entries.remaining).toBe(0);

    // Undoing turn 9 keeps it as the first undone turn; the client then has it in full.
    setDocument(session({entries: page([turnAt(7)], 5, 3), undone: page([turnAt(9)], 7)}));
    expect(shown()).toEqual([1, 3, 5, 7]);
    expect(undone()).toEqual([9]);

    // Undone turns beyond the window stay too, so what the client undid itself is there to redo.
    setDocument(session({entries: page([turnAt(1), turnAt(3)]), undone: page([turnAt(5), turnAt(7), turnAt(9)], 3, 1)}));
    setDocument(session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1, 3)}));
    expect(shown()).toEqual([1]);
    expect(undone()).toEqual([3, 5, 7, 9]);
    expect(document().undone.remaining).toBe(1);
    // A page of later undone turns extends the back the same way.
    addHistoryPage("session-1", "undone", 9, page([turnAt(11)], 9));
    expect(undone()).toEqual([3, 5, 7, 9, 11]);
    expect(document().undone.remaining).toBe(0);
    expect(document().undone.precedingEntryId).toBe(1);

    // A window starting the history (a send after undoing every turn) replaces it.
    setDocument(session({entries: page([turnAt(20)])}));
    expect(shown()).toEqual([20]);
  });

  it("joins the window of an undo past the loaded pages where they meet, and starts from it where they do not", () => {
    const {addHistoryPage, document, setDocument} = held();
    const shown = () => document().entries.items.map((item) => item.id);
    const undone = () => document().undone.items.map((item) => item.id);
    setDocument(session({entries: page([turnAt(9), turnAt(11)], 7, 4)}));
    addHistoryPage("session-1", "entries", 9, page([turnAt(5), turnAt(7)], 3, 2));

    // An undo to turn 7 stays in what the client holds.
    setDocument(session({entries: page([turnAt(7)], 5, 3), undone: page([turnAt(9), turnAt(11)], 7)}));
    expect(shown()).toEqual([5, 7]);
    expect(undone()).toEqual([9, 11]);

    // An undo to turn 1: its undone page ends at turn 5, which the client holds, so what it loaded after follows.
    setDocument(session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1, 3)}));
    expect(shown()).toEqual([1]);
    expect(undone()).toEqual([3, 5, 7, 9, 11]);
    expect(document().undone.remaining).toBe(0);

    // Holding only the newest turns, the same undo's window meets nothing it holds and replaces it.
    reset();
    setDocument(session({entries: page([turnAt(9), turnAt(11)], 7, 4)}));
    setDocument(session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1, 3)}));
    expect(shown()).toEqual([1]);
    expect(undone()).toEqual([3, 5]);
    expect(document().undone.remaining).toBe(3);
  });

  it.each([0, 2])("keeps a loaded oversized turn when a new window starts after it (%i earlier turns)", (remaining) => {
    const {document: merged, setDocument} = held();
    const answer = transcript([assistantEntry("x".repeat(6 * 1024 * 1024))], {firstId: 6})[0]!;
    const loaded = page([turnAt(5), answer], remaining === 0 ? null : 4, remaining);
    setDocument(session({entries: loaded}));
    const window = session({entries: page([turnAt(7)], 6, remaining + 1), runStart: 7});

    setDocument(window);

    const document = merged();
    expect(document.entries.items.map((item) => item.id)).toEqual([5, 6, 7]);
    expect(document.entries.items[1]).toBe(answer);
    expect(document.entries).toMatchObject({remaining, precedingEntryId: loaded.precedingEntryId});
    expect(live(document)).toMatchObject({turnIds: ["5"], liveTurn: {id: "7"}});

    setDocument({...window, live: runningLive()});
    expect(merged().entries).toBe(document.entries);
  });

  it.each([
    {name: "send after undo", precedingEntryId: 1, remaining: 1, expected: [1, 9]},
    {name: "missed update", precedingEntryId: 7, remaining: 3, expected: [9]},
    {name: "history restart", precedingEntryId: null, remaining: 0, expected: [9]},
  ])("connects a disjoint window only at its known boundary: $name", ({precedingEntryId, remaining, expected}) => {
    const {document: merged, setDocument} = held();
    setDocument(session({entries: page([turnAt(1)]), undone: page([turnAt(3), turnAt(5)], 1)}));

    setDocument(session({entries: {items: [turnAt(9)], remaining, precedingEntryId}}));

    const document = merged();
    expect(document.entries.items.map((item) => item.id)).toEqual(expected);
    expect(document.entries.remaining).toBe(expected.length === 2 ? 0 : remaining);
    expect(document.undone.items).toEqual([]);
  });

  it.each(["entries", "undone"] as const)("keeps loaded %s stable across live-only updates", (side) => {
    const {addHistoryPage, document, setDocument} = held();
    const window = session({[side]: page([turnAt(5), turnAt(7)], side === "entries" ? 3 : null, 2)});
    setDocument(window);
    addHistoryPage("session-1", side, side === "entries" ? 5 : 7, page(side === "entries" ? [turnAt(1), turnAt(3)] : [turnAt(9), turnAt(11)]));
    const before = document();
    const beforeView = live(before);

    setDocument({...window, live: runningLive()});

    const after = document();
    expect(after[side], "merging the server window must not invalidate unchanged loaded history").toBe(before[side]);
    expect(live(after)[side === "entries" ? "turns" : "undoneTurns"]).toBe(beforeView[side === "entries" ? "turns" : "undoneTurns"]);
    expect(after.live).not.toBe(before.live);
  });

  it.each(["entries", "undone"] as const)("accepts a changed %s payload even when its entry id is unchanged", (side) => {
    const {document, setDocument} = held();
    const window = session({[side]: page([turnAt(5)])});
    setDocument(window);
    const changed = {...window[side].items[0]!, data: {contentParts: [{type: "text", text: "Changed"}], turnIndex: 0}};

    setDocument({...window, [side]: page([changed])});

    expect(document()[side].items[0]).toBe(changed);
  });
});
