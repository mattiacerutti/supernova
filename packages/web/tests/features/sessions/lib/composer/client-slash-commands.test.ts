import {describe, expect, it, vi} from "vitest";
import {clientSlashCommandSuggestions} from "@/features/sessions/lib/composer/client-slash-commands";

describe("client slash command suggestions", () => {
  it("returns only commands with registered actions", () => {
    const compact = vi.fn();

    const suggestions = clientSlashCommandSuggestions({actions: {compact}, query: ""});

    expect(suggestions).toMatchObject([{id: "compact", kind: "slash-command", title: "Compact"}]);
    expect(suggestions).toHaveLength(1);
  });

  it("matches commands by id, title, and subtitle", () => {
    const actions = {compact: vi.fn(), redo: vi.fn(), undo: vi.fn()};

    expect(clientSlashCommandSuggestions({actions, query: "roll"}).map((item) => item.id)).toEqual(["undo"]);
    expect(clientSlashCommandSuggestions({actions, query: "restore"}).map((item) => item.id)).toEqual(["redo"]);
    expect(clientSlashCommandSuggestions({actions, query: "context"}).map((item) => item.id)).toEqual(["compact"]);
  });

  it("binds each suggestion to its registered action", () => {
    const undo = vi.fn();
    const suggestions = clientSlashCommandSuggestions({actions: {undo}, query: "undo"});

    suggestions[0]?.onSelect();

    expect(undo).toHaveBeenCalledOnce();
  });
});
