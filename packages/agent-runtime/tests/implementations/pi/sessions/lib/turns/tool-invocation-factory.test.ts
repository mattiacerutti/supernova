import {Schema} from "effect";
import {describe, expect, it} from "vitest";
import {PiToolInvocationFactory} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/tool-invocation-factory";
import {SessionTool} from "@supernova/contracts/sessions/schemas";
import type {SessionTool as SessionToolType} from "@supernova/contracts/sessions/schemas";

function expectSessionTool(value: SessionToolType): void {
  expect(() => Schema.decodeUnknownSync(SessionTool)(value)).not.toThrow();
}

describe("PiToolInvocationFactory", () => {
  it("omits incomplete streaming input for tools with required fields", () => {
    const tools = [
      PiToolInvocationFactory.create("bash", {}).toSessionTool(),
      PiToolInvocationFactory.create("bash", {timeout: 1_000}).toSessionTool(),
      PiToolInvocationFactory.create("bash", {command: 42}).toSessionTool(),
      PiToolInvocationFactory.create("read", {}).toSessionTool(),
      PiToolInvocationFactory.create("read", {limit: 20}).toSessionTool(),
      PiToolInvocationFactory.create("read", {path: 42}).toSessionTool(),
      PiToolInvocationFactory.create("edit", {path: "src/app.ts"}).toSessionTool(),
      PiToolInvocationFactory.create("edit", {edits: [{newText: "new", oldText: "old"}]}).toSessionTool(),
      PiToolInvocationFactory.create("edit", {edits: [{oldText: "old"}], path: "src/app.ts"}).toSessionTool(),
      PiToolInvocationFactory.create("edit", {edits: [{newText: "new"}], path: "src/app.ts"}).toSessionTool(),
      PiToolInvocationFactory.create("edit", {edits: "[]", path: "src/app.ts"}).toSessionTool(),
      PiToolInvocationFactory.create("write", {path: "src/app.ts"}).toSessionTool(),
      PiToolInvocationFactory.create("write", {content: "export {}"}).toSessionTool(),
      PiToolInvocationFactory.create("find", {}).toSessionTool(),
      PiToolInvocationFactory.create("find", {path: "src"}).toSessionTool(),
      PiToolInvocationFactory.create("find", {pattern: 42}).toSessionTool(),
    ];

    expect(tools).toEqual([
      {kind: "command", status: "pending"},
      {kind: "command", status: "pending"},
      {kind: "command", status: "pending"},
      {kind: "file-read", status: "pending"},
      {kind: "file-read", status: "pending"},
      {kind: "file-read", status: "pending"},
      {kind: "file-edit", status: "pending"},
      {kind: "file-edit", status: "pending"},
      {kind: "file-edit", status: "pending"},
      {kind: "file-edit", status: "pending"},
      {kind: "file-edit", status: "pending"},
      {kind: "file-write", status: "pending"},
      {kind: "file-write", status: "pending"},
      {kind: "file-find", status: "pending"},
      {kind: "file-find", status: "pending"},
      {kind: "file-find", status: "pending"},
    ]);
    tools.forEach(expectSessionTool);
  });

  it("projects complete tool inputs into provider-agnostic session tool input", () => {
    expect(PiToolInvocationFactory.create("bash", {command: "bun test", timeout: 1_000}).toSessionTool()).toEqual({
      input: {command: "bun test", timeoutMs: 1_000},
      kind: "command",
      status: "pending",
    });
    expect(PiToolInvocationFactory.create("read", {limit: 20, offset: 5, path: "src/app.ts"}).toSessionTool()).toEqual({
      input: {limit: 20, offset: 5, path: "src/app.ts"},
      kind: "file-read",
      status: "pending",
    });
    expect(PiToolInvocationFactory.create("edit", {edits: [{newText: "new", oldText: "old"}], path: "src/app.ts"}).toSessionTool()).toEqual({
      input: {path: "src/app.ts", replacements: [{newText: "new", oldText: "old"}]},
      kind: "file-edit",
      status: "pending",
    });
    expect(PiToolInvocationFactory.create("write", {content: "export {};", path: "src/app.ts"}).toSessionTool()).toEqual({
      input: {content: "export {};", path: "src/app.ts"},
      kind: "file-write",
      status: "pending",
    });
    expect(PiToolInvocationFactory.create("find", {limit: 10, path: "src", pattern: "*.ts"}).toSessionTool()).toEqual({
      input: {limit: 10, path: "src", pattern: "*.ts"},
      kind: "file-find",
      status: "pending",
    });
  });

  it("keeps schema-valid optional-only inputs for tools without required fields", () => {
    const pendingList = PiToolInvocationFactory.create("ls", {}).toSessionTool();

    expect(pendingList).toEqual({
      input: {limit: undefined, path: undefined},
      kind: "file-list",
      status: "pending",
    });
    expectSessionTool(pendingList);
  });

  it("maps completed and failed command results", () => {
    const completed = PiToolInvocationFactory.create("bash", {command: "printf '42\\n'"});
    completed.complete({details: {truncation: {truncated: true}}, isError: false, output: [{text: "42\n", type: "text"}]});

    expect(completed.toSessionTool()).toEqual({
      input: {command: "printf '42\\n'", timeoutMs: undefined},
      kind: "command",
      result: {output: "42\n", truncated: true},
      status: "completed",
    });
    expectSessionTool(completed.toSessionTool());

    const failed = PiToolInvocationFactory.create("bash", {command: "exit 1"});
    failed.complete({details: undefined, isError: true, output: [{text: "failed", type: "text"}]});

    expect(failed.toSessionTool()).toEqual({
      error: "failed",
      input: {command: "exit 1", timeoutMs: undefined},
      kind: "command",
      status: "error",
    });
    expectSessionTool(failed.toSessionTool());
  });

  it("maps completed edit results into a standard patch", () => {
    const completed = PiToolInvocationFactory.create("edit", {edits: [{newText: "primary", oldText: "ghost"}], path: "button.tsx"});
    completed.complete({
      details: {diff: "-1 ghost\n+1 primary", firstChangedLine: 1},
      isError: false,
      output: [{text: "Successfully replaced 1 block(s) in button.tsx.", type: "text"}],
    });

    expect(completed.toSessionTool()).toEqual({
      input: {path: "button.tsx", replacements: [{newText: "primary", oldText: "ghost"}]},
      kind: "file-edit",
      result: {patch: "--- a/button.tsx\n+++ b/button.tsx\n@@ -1,1 +1,1 @@\n-ghost\n+primary"},
      status: "completed",
    });
    expectSessionTool(completed.toSessionTool());
  });

  it("maps completed write results into a standard patch", () => {
    const completed = PiToolInvocationFactory.create("write", {content: "one\ntwo\n", path: "notes.txt"});
    completed.complete({details: undefined, isError: false, output: [{text: "Successfully wrote 8 bytes to notes.txt", type: "text"}]});

    expect(completed.toSessionTool()).toEqual({
      input: {content: "one\ntwo\n", path: "notes.txt"},
      kind: "file-write",
      result: {patch: "--- /dev/null\n+++ b/notes.txt\n@@ -0,0 +1,2 @@\n+one\n+two"},
      status: "completed",
    });
    expectSessionTool(completed.toSessionTool());
  });

  it("maps custom tools without provider-specific names", () => {
    const invocation = PiToolInvocationFactory.create("unknown-tool", {value: 42});
    invocation.complete({details: {extra: true}, isError: false, output: "done"});

    expect(invocation.toSessionTool()).toEqual({
      input: {value: 42},
      kind: "custom",
      result: {data: {extra: true}, output: "done"},
      status: "completed",
    });
    expectSessionTool(invocation.toSessionTool());
  });
});
