import {mkdtemp, realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import type {TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {createSpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {cleanupTempDirs, waitUntil} from "@tests/support/async";

describe("Terminals", () => {
  const tempDirs: string[] = [];
  const terminals = new Terminals({spawnPty: createSpawnPty()});
  /** A terminal's entry in the replicated state, once `done(entry)` stops throwing. */
  const entry = async (id: string, done: (entry: TerminalOutput) => void): Promise<TerminalOutput> => {
    let found: TerminalOutput | undefined;
    await waitUntil(
      () => {
        found = terminals.state.value.terminals[id];
        if (!found) throw new Error(`Terminal ${id} is not in the state.`);
        done(found);
      },
      {timeoutMs: 5_000}
    );
    return found!;
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

  it("runs a shell in the requested directory and replicates its output", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    const terminal = await terminals.open({cols: 80, cwd, id: "t1", rows: 24, sessionId: "s1"});
    expect(terminal).toEqual({cwd, id: "t1", sessionId: "s1"});

    await terminals.write({data: "pwd\n", id: "t1"});
    await entry("t1", (current) => {
      if (!current.output.includes(cwd)) throw new Error("No pwd output yet.");
    });
    expect((await terminals.list({sessionId: "s1"})).terminals).toEqual([{cwd, id: "t1", sessionId: "s1"}]);
  });

  it("keeps history for clients that subscribe later and reports exit without removing the terminal", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    await terminals.open({cols: 80, cwd, id: "t2", rows: 24, sessionId: "s1"});
    await terminals.write({data: "echo MARKER_$((40+2))\n", id: "t2"});
    await entry("t2", (current) => {
      if (!current.output.includes("MARKER_42")) throw new Error("History does not have the marker yet.");
    });
    // A subscriber that arrives later receives the history at once.
    let seen: TerminalOutput | undefined;
    terminals.state.subscribe((state) => void (seen = state.terminals.t2))();
    expect(seen?.output).toContain("MARKER_42");

    await terminals.write({data: "exit 3\n", id: "t2"});
    const exited = await entry("t2", (current) => {
      if (current.terminal.exitCode === undefined) throw new Error("Not exited.");
    });
    expect(exited.terminal.exitCode).toBe(3);
    expect((await terminals.list({sessionId: "s1"})).terminals).toEqual([{cwd, exitCode: 3, id: "t2", sessionId: "s1"}]);
    // Writes to an exited shell are dropped, not errors.
    await terminals.write({data: "ignored\n", id: "t2"});
  });

  it("closing kills the shell and closing a session kills all of its shells", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    await terminals.open({cols: 80, cwd, id: "a", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "b", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "c", rows: 24, sessionId: "s2"});

    await entry("a", () => undefined);
    await terminals.close({id: "a"});
    expect(terminals.state.value.terminals.a).toBeUndefined();
    await expect(terminals.write({data: "x", id: "a"})).rejects.toMatchObject({_tag: "TerminalNotFoundError"});

    await terminals.closeSession("s1");
    expect((await terminals.list({sessionId: "s1"})).terminals).toEqual([]);
    expect((await terminals.list({sessionId: "s2"})).terminals).toHaveLength(1);
    expect(Object.keys(terminals.state.value.terminals)).toEqual(["c"]);
  });

  it("caps the replicated scrollback from the front and counts what it dropped", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    await terminals.open({cols: 80, cwd, id: "big", rows: 24, sessionId: "s1"});
    // About 400 KB of output, past the 256 KB cap.
    await terminals.write({data: "yes 0123456789012345678901234567890123456789 | head -n 9000; echo DONE_$((1+1))\n", id: "big"});
    const capped = await entry("big", (current) => {
      // Computed by the shell, so the echoed command line does not match.
      if (!current.output.includes("DONE_2")) throw new Error("Output not finished.");
    });
    expect(capped.output.length).toBeLessThanOrEqual(256 * 1024);
    expect(capped.dropped).toBeGreaterThan(0);
  });

  it("reopening an id attaches to the running shell instead of starting another", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    const first = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    const second = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    expect(second).toEqual(first);
    expect((await terminals.list({sessionId: "s1"})).terminals).toHaveLength(1);
  });
});
