import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import {describe, expect, it} from "vitest";
import {summarizeWork} from "@/features/sessions/lib/timeline/work-summary";

function command(id: string, status: "completed" | "error" = "completed"): SessionWorkEvent {
  const tool =
    status === "error"
      ? {error: "boom", input: {command: "ls"}, kind: "command" as const, status}
      : {input: {command: "ls"}, kind: "command" as const, result: {output: "", truncated: false}, status};
  return {id, timestamp: "2026-01-01T00:00:00.000Z", tool, type: "tool"};
}

function edit(id: string, path: string): SessionWorkEvent {
  return {id, timestamp: "2026-01-01T00:00:00.000Z", tool: {input: {path, replacements: []}, kind: "file-edit", result: {patch: ""}, status: "completed"}, type: "tool"};
}

describe("summarizeWork", () => {
  it("counts commands and distinct edited files", () => {
    expect(summarizeWork([command("1"), command("2"), command("3"), edit("4", "a.ts"), edit("5", "b.ts")])).toBe("Ran 3 commands · edited 2 files");
    expect(summarizeWork([edit("1", "a.ts"), edit("2", "a.ts")])).toBe("Edited 1 file");
  });

  it("appends failures", () => {
    expect(summarizeWork([command("1", "error")])).toBe("Ran 1 command · 1 failed");
  });
});
