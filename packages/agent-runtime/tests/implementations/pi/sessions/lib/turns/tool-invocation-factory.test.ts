import {describe, expect, it} from "vitest";
import {PiToolInvocationFactory} from "@supernova/agent-runtime/implementations/pi/sessions/lib/turns/tool-invocation-factory";

describe("PiToolInvocationFactory", () => {
  it("omits incomplete streaming input for tools with required fields", () => {
    expect(PiToolInvocationFactory.create("bash", {}).toSessionTool()).toEqual({kind: "command", status: "pending"});
    expect(PiToolInvocationFactory.create("read", {}).toSessionTool()).toEqual({kind: "file-read", status: "pending"});
    expect(PiToolInvocationFactory.create("edit", {path: "src/app.ts"}).toSessionTool()).toEqual({kind: "file-edit", status: "pending"});
    expect(PiToolInvocationFactory.create("find", {}).toSessionTool()).toEqual({kind: "file-find", status: "pending"});
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
    expect(PiToolInvocationFactory.create("find", {limit: 10, path: "src", pattern: "*.ts"}).toSessionTool()).toEqual({
      input: {limit: 10, path: "src", pattern: "*.ts"},
      kind: "file-find",
      status: "pending",
    });
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

    const failed = PiToolInvocationFactory.create("bash", {command: "exit 1"});
    failed.complete({details: undefined, isError: true, output: [{text: "failed", type: "text"}]});

    expect(failed.toSessionTool()).toEqual({
      error: "failed",
      input: {command: "exit 1", timeoutMs: undefined},
      kind: "command",
      status: "error",
    });
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
  });
});
