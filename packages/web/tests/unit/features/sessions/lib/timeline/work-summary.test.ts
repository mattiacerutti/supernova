import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import {describe, expect, it} from "vitest";
import {hasToolDetails, readLineRange} from "@/features/sessions/lib/timeline/tool-details";
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

describe("file read rows", () => {
  it("only expands a read for truncation or errors", () => {
    const ranged = {input: {limit: 50, offset: 120, path: "src/a.ts"}, kind: "file-read" as const, result: {}, status: "completed" as const};
    expect(hasToolDetails(ranged)).toBe(false);
    expect(hasToolDetails({input: {path: "src/a.ts"}, kind: "file-read", status: "pending"})).toBe(false);
    expect(hasToolDetails({...ranged, result: {truncated: true}})).toBe(true);
    expect(hasToolDetails({error: "missing", input: {path: "src/a.ts"}, kind: "file-read", status: "error"})).toBe(true);
  });

  it("formats a partial read's line range", () => {
    expect(readLineRange({limit: 50, offset: 120})).toBe("L120–169");
    expect(readLineRange({limit: 50})).toBe("L1–50");
    expect(readLineRange({offset: 120})).toBe("L120+");
    expect(readLineRange({})).toBeUndefined();
  });
});
