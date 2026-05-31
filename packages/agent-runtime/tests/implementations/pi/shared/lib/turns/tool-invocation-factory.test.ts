import {Schema} from "effect";
import {describe, expect, it} from "vitest";
import {PiToolInvocationFactory} from "@supernova/agent-runtime/implementations/pi/shared/lib/turns/tool-invocation-factory";
import {Tool} from "@supernova/contracts/sessions/schemas";
import type {Tool as ToolType} from "@supernova/contracts/sessions/schemas";

function expectValidTool(tool: ToolType): void {
  expect(() => Schema.decodeUnknownSync(Tool)(tool)).not.toThrow();
}

describe("mapping Pi tool invocations", () => {
  it("maps known pending tool inputs into the shared tool contract", () => {
    const tools = [
      PiToolInvocationFactory.create("bash", {command: "bun test", timeout: 1_000}).toTool(),
      PiToolInvocationFactory.create("read", {limit: 20, offset: 5, path: "src/app.ts"}).toTool(),
      PiToolInvocationFactory.create("edit", {edits: [{newText: "new", oldText: "old"}], path: "src/app.ts"}).toTool(),
      PiToolInvocationFactory.create("write", {content: "export {};", path: "src/app.ts"}).toTool(),
      PiToolInvocationFactory.create("find", {limit: 10, path: "src", pattern: "*.ts"}).toTool(),
    ];

    expect(tools).toEqual([
      {input: {command: "bun test", timeoutMs: 1_000}, kind: "command", status: "pending"},
      {input: {limit: 20, offset: 5, path: "src/app.ts"}, kind: "file-read", status: "pending"},
      {input: {path: "src/app.ts", replacements: [{newText: "new", oldText: "old"}]}, kind: "file-edit", status: "pending"},
      {input: {content: "export {};", path: "src/app.ts"}, kind: "file-write", status: "pending"},
      {input: {limit: 10, path: "src", pattern: "*.ts"}, kind: "file-find", status: "pending"},
    ]);
    tools.forEach(expectValidTool);
  });

  it("keeps incomplete streaming inputs schema-valid", () => {
    const tools = [
      PiToolInvocationFactory.create("bash", {}).toTool(),
      PiToolInvocationFactory.create("read", {limit: 20}).toTool(),
      PiToolInvocationFactory.create("edit", {path: "src/app.ts"}).toTool(),
    ];

    expect(tools).toEqual([
      {kind: "command", status: "pending"},
      {kind: "file-read", status: "pending"},
      {kind: "file-edit", status: "pending"},
    ]);
    tools.forEach(expectValidTool);
  });

  it("maps completed command output and failed tools", () => {
    const completed = PiToolInvocationFactory.create("bash", {command: "printf '42'"});
    completed.complete({details: {truncation: {truncated: true}}, isError: false, output: [{text: "42", type: "text"}]});
    const failed = PiToolInvocationFactory.create("bash", {command: "exit 1"});
    failed.complete({details: undefined, isError: true, output: [{text: "failed", type: "text"}]});

    expect(completed.toTool()).toEqual({input: {command: "printf '42'", timeoutMs: undefined}, kind: "command", result: {output: "42", truncated: true}, status: "completed"});
    expect(failed.toTool()).toEqual({error: "failed", input: {command: "exit 1", timeoutMs: undefined}, kind: "command", status: "error"});
    expectValidTool(completed.toTool());
    expectValidTool(failed.toTool());
  });

  it("maps file-changing tools to standard patches", () => {
    const edit = PiToolInvocationFactory.create("edit", {edits: [{newText: "primary", oldText: "ghost"}], path: "button.tsx"});
    edit.complete({
      details: {diff: "-1 ghost\n+1 primary", patch: "--- a/button.tsx\n+++ b/button.tsx\n@@ -1,1 +1,1 @@\n-ghost\n+primary"},
      isError: false,
      output: [{text: "edited", type: "text"}],
    });
    const write = PiToolInvocationFactory.create("write", {content: "one\ntwo\n", path: "notes.txt"});
    write.complete({details: undefined, isError: false, output: [{text: "written", type: "text"}]});

    expect(edit.toTool()).toMatchObject({kind: "file-edit", result: {patch: "--- a/button.tsx\n+++ b/button.tsx\n@@ -1,1 +1,1 @@\n-ghost\n+primary"}, status: "completed"});
    expect(write.toTool()).toMatchObject({kind: "file-write", result: {patch: "--- /dev/null\n+++ b/notes.txt\n@@ -0,0 +1,2 @@\n+one\n+two"}, status: "completed"});
  });

  it("preserves unknown tools as custom tool events", () => {
    const invocation = PiToolInvocationFactory.create("unknown-tool", {value: 42});
    invocation.complete({details: {extra: true}, isError: false, output: "done"});

    expect(invocation.toTool()).toEqual({input: {value: 42}, kind: "custom", result: {data: {extra: true}, output: "done"}, status: "completed"});
    expectValidTool(invocation.toTool());
  });
});
