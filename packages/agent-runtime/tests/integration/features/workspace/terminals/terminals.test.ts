import {mkdtemp, realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import type {TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {cleanupTempDirs, waitUntil} from "@tests/support/async";

describe("Terminals", () => {
  const tempDirs: string[] = [];
  const terminals = new Terminals({spawnPty});
  /** A terminal's output, once `done(output)` stops throwing. */
  const output = async (id: string, done: (output: TerminalOutput) => void): Promise<TerminalOutput> => {
    let found: TerminalOutput | undefined;
    await waitUntil(
      () => {
        found = terminals.output(id).value;
        done(found);
      },
      {timeoutMs: 5_000}
    );
    return found!;
  };
  const workspace = async (): Promise<string> => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    return cwd;
  };
  const originalShell = process.env.SHELL;

  // A plain sh starts instantly and has no rc files, unlike the developer's login shell.
  beforeAll(() => {
    process.env.SHELL = "/bin/sh";
  });
  afterAll(() => {
    process.env.SHELL = originalShell;
  });

  afterEach(async () => {
    await terminals.dispose();
    cleanupTempDirs(tempDirs);
  });

  it("runs a shell in the requested directory, lists it without output, and keeps its output separately", async () => {
    const cwd = await workspace();
    const terminal = await terminals.open({cols: 80, cwd, id: "t1", rows: 24, sessionId: "s1"});
    expect(terminal).toEqual({cwd, id: "t1", number: 1, sessionId: "s1", startedAt: expect.any(String)});

    await terminals.write({data: "pwd\n", id: "t1"});
    await output("t1", (current) => expect(current.output).toContain(cwd));
    expect(terminals.state.value.terminals).toEqual({t1: terminal});
  });

  it("numbers a session's terminals with the smallest free number", async () => {
    const cwd = await workspace();
    expect((await terminals.open({cols: 80, cwd, id: "a", rows: 24, sessionId: "s1"})).number).toBe(1);
    expect((await terminals.open({cols: 80, cwd, id: "b", rows: 24, sessionId: "s1"})).number).toBe(2);
    expect((await terminals.open({cols: 80, cwd, id: "other", rows: 24, sessionId: "s2"})).number).toBe(1);
    await terminals.close({id: "a"});
    expect((await terminals.open({cols: 80, cwd, id: "c", rows: 24, sessionId: "s1"})).number).toBe(1);
  });

  it("keeps history for clients that subscribe later and reports exit without removing the terminal", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "t2", rows: 24, sessionId: "s1"});
    await terminals.write({data: "echo MARKER_$((40+2))\n", id: "t2"});
    await output("t2", (current) => expect(current.output).toContain("MARKER_42"));
    // A subscriber that arrives later receives the history at once.
    let seen: TerminalOutput | undefined;
    terminals.output("t2").subscribe((value) => void (seen = value))();
    expect(seen?.output).toContain("MARKER_42");

    await terminals.write({data: "exit 3\n", id: "t2"});
    const exited = await output("t2", (current) => expect(current.exitCode).toBe(3));
    expect(exited.closed).toBeUndefined();
    expect(terminals.state.value.terminals.t2?.exitCode).toBe(3);
    // Writes to an exited shell are dropped, not errors.
    await terminals.write({data: "ignored\n", id: "t2"});
  });

  it("closing kills the shell and ends its output, and closing a session kills all of its shells", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "a", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "b", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "c", rows: 24, sessionId: "s2"});

    const outputA = terminals.output("a");
    await terminals.close({id: "a"});
    expect(outputA.value.closed).toBe(true);
    expect(terminals.state.value.terminals.a).toBeUndefined();
    expect(() => terminals.output("a")).toThrow("Terminal not found.");
    await expect(terminals.write({data: "x", id: "a"})).rejects.toMatchObject({_tag: "TerminalNotFoundError"});

    await terminals.closeSession("s1");
    expect(Object.keys(terminals.state.value.terminals)).toEqual(["c"]);
  });

  it("caps the scrollback from the front and counts what it dropped", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "big", rows: 24, sessionId: "s1"});
    // About 400 KB of output, past the 256 KB cap.
    await terminals.write({data: "yes 0123456789012345678901234567890123456789 | head -n 9000; echo DONE_$((1+1))\n", id: "big"});
    // Computed by the shell, so the echoed command line does not match.
    const capped = await output("big", (current) => expect(current.output).toContain("DONE_2"));
    expect(capped.output.length).toBeLessThanOrEqual(256 * 1024);
    expect(capped.dropped).toBeGreaterThan(0);
  });

  it("reopening an id attaches to the running shell instead of starting another", async () => {
    const cwd = await workspace();
    const first = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    const second = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    expect(second).toEqual(first);
    expect(Object.keys(terminals.state.value.terminals)).toEqual(["same"]);
  });
});
