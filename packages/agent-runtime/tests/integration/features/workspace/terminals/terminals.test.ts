import {mkdtemp, realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterAll, afterEach, beforeAll, describe, expect, it} from "vitest";
import type {TerminalEvent} from "@supernova/contracts/terminals/schemas";
import {createSpawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {cleanupTempDirs, waitUntil} from "@tests/support/async";

/** Collects events from a watch until `done(events)` stops throwing, then stops watching. */
async function collect(watching: Promise<AsyncGenerator<TerminalEvent, void, undefined>>, done: (events: TerminalEvent[]) => void): Promise<TerminalEvent[]> {
  const watch = await watching;
  const events: TerminalEvent[] = [];
  const pump = (async () => {
    for await (const event of watch) events.push(event);
  })();
  try {
    await waitUntil(() => done(events), {timeoutMs: 5_000});
  } finally {
    await watch.return(undefined);
    await pump;
  }
  return events;
}

const output = (events: TerminalEvent[]): string => events.map((event) => ("data" in event ? event.data : "")).join("");

describe("Terminals", () => {
  const tempDirs: string[] = [];
  const terminals = new Terminals({spawnPty: createSpawnPty()});
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

  it("runs a shell in the requested directory and streams its output", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    const terminal = await terminals.open({cols: 80, cwd, id: "t1", rows: 24, sessionId: "s1"});
    expect(terminal).toEqual({cwd, id: "t1", sessionId: "s1"});

    await terminals.write({data: "pwd\n", id: "t1"});
    const events = await collect(terminals.watch({id: "t1"}), (events) => {
      if (!output(events).includes(cwd)) throw new Error("No pwd output yet.");
    });
    expect(events[0]?.type).toBe("terminal.history");
    expect((await terminals.list({sessionId: "s1"})).terminals).toEqual([{cwd, id: "t1", sessionId: "s1"}]);
  });

  it("replays history to a client that attaches later and reports exit without removing the terminal", async () => {
    const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-terminal-")));
    tempDirs.push(cwd);
    await terminals.open({cols: 80, cwd, id: "t2", rows: 24, sessionId: "s1"});
    await terminals.write({data: "echo MARKER_$((40+2))\n", id: "t2"});
    await waitUntil(
      async () => {
        const events = await collect(terminals.watch({id: "t2"}), (events) => {
          if (events.length === 0) throw new Error("no history");
        });
        if (!output(events).includes("MARKER_42")) throw new Error("History does not have the marker yet.");
      },
      {timeoutMs: 5_000}
    );

    await terminals.write({data: "exit 3\n", id: "t2"});
    const events = await collect(terminals.watch({id: "t2"}), (events) => {
      if (!events.some((event) => event.type === "terminal.exited")) throw new Error("Not exited.");
    });
    expect(events.find((event) => event.type === "terminal.exited")).toEqual({type: "terminal.exited", exitCode: 3});
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

    const watched = collect(terminals.watch({id: "a"}), (events) => {
      if (!events.some((event) => event.type === "terminal.closed")) throw new Error("Not closed.");
    });
    await terminals.close({id: "a"});
    expect(await watched).toContainEqual({type: "terminal.closed"});
    await expect(terminals.write({data: "x", id: "a"})).rejects.toMatchObject({_tag: "TerminalNotFoundError"});

    await terminals.closeSession("s1");
    expect((await terminals.list({sessionId: "s1"})).terminals).toEqual([]);
    expect((await terminals.list({sessionId: "s2"})).terminals).toHaveLength(1);
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
