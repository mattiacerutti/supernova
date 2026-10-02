import type {ToolResultMessage} from "@supernova/contracts/sessions/schemas";
import {describe, expect, it} from "vitest";
import {hasToolDetails, readLineRange} from "@/features/sessions/lib/timeline/work/tool-details";
import {summarizeWork} from "@/features/sessions/lib/timeline/work/work-summary";
import type {SessionToolCall, SessionWorkEvent} from "@/features/sessions/types/session-turn";

function result(name: string, input: {readonly details?: ToolResultMessage["details"]; readonly isError?: boolean; readonly text?: string} = {}): ToolResultMessage {
  return {
    content: [{text: input.text ?? "", type: "text"}],
    details: input.details,
    isError: input.isError ?? false,
    role: "toolResult",
    timestamp: 0,
    toolCallId: "call",
    toolName: name,
  };
}

function call(name: string, args: Record<string, unknown>, status: SessionToolCall["status"], details?: ToolResultMessage["details"]): SessionToolCall {
  const finished = status === "pending" ? undefined : result(name, {details, isError: status === "error", text: status === "error" ? "boom" : ""});
  return {arguments: args, callId: "call", name, output: undefined, result: finished, status};
}

function event(id: string, tool: SessionToolCall): SessionWorkEvent {
  return {id, timestamp: "2026-01-01T00:00:00.000Z", tool, type: "tool"};
}

function command(id: string, status: "completed" | "error" = "completed"): SessionWorkEvent {
  return event(id, call("bash", {command: "ls"}, status));
}

function edit(id: string, path: string): SessionWorkEvent {
  return event(id, call("edit", {edits: [], path}, "completed", {patch: ""}));
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
    const ranged = {limit: 50, offset: 120, path: "src/a.ts"};
    expect(hasToolDetails(call("read", ranged, "completed"))).toBe(false);
    expect(hasToolDetails(call("read", {path: "src/a.ts"}, "pending"))).toBe(false);
    expect(hasToolDetails(call("read", ranged, "completed", {truncation: {truncated: true}}))).toBe(true);
    expect(hasToolDetails(call("read", {path: "src/a.ts"}, "error"))).toBe(true);
  });

  it("formats a partial read's line range", () => {
    expect(readLineRange({limit: 50, offset: 120})).toBe("L120–169");
    expect(readLineRange({limit: 50})).toBe("L1–50");
    expect(readLineRange({offset: 120})).toBe("L120+");
    expect(readLineRange({})).toBeUndefined();
  });
});
