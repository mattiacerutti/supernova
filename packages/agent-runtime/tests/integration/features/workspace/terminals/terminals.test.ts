import {mkdtemp, realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {Host} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ServerHost} from "@supernova/contracts/lib/protocol";
import type {TerminalOutput} from "@supernova/contracts/services/workspace/schemas";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {workspaceFacet} from "@supernova/agent-runtime/features/workspace/facet";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/terminals/pty";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import {Workspace} from "@supernova/agent-runtime/features/workspace/workspace";
import {cleanupTempDirs, waitUntil} from "@tests/support/async";
import {shellCommand, testShell} from "@tests/support/terminal";

describe("Terminals", () => {
  const tempDirs: string[] = [];
  const terminals = new Terminals({spawnPty});
  let client: Host<RuntimePrincipal>;
  let closeHosts = async (): Promise<void> => undefined;
  let workspaceOwner: {readonly terminals: {readonly value: {readonly terminals: Readonly<Record<string, {readonly exitCode?: number}>>}}};
  const list = () => workspaceOwner.terminals.value.terminals;
  /** Held until the test ends: a closed terminal's output stays readable only for a client still holding it. */
  const shown = new Map<string, {readonly output: {readonly value: TerminalOutput}; release(): void}>();
  const outputOf = async (id: string): Promise<TerminalOutput | undefined> => {
    let held = shown.get(id);
    if (!held) {
      const reference = await client.get(TerminalService, {terminalId: id}, context, {readyTimeout: 1_000}).catch(() => undefined);
      if (reference?.variant !== "owner") return undefined;
      held = reference;
      shown.set(id, held);
    }
    return held.output.value;
  };
  const watchOutput = async (id: string) => {
    const held = await client.get(TerminalService, {terminalId: id}, context);
    if (held.variant !== "owner") throw new Error("The owner's terminal variant did not bind.");
    const watch = await held.output.watch(context);
    return {
      value: watch.value,
      start: watch.start.bind(watch),
      stop: async () => {
        await watch.stop();
        held.release();
      },
    };
  };
  /** A terminal's output, once `done(output)` stops throwing. */
  const output = async (id: string, done: (output: TerminalOutput) => void): Promise<TerminalOutput> => {
    let found: TerminalOutput | undefined;
    await waitUntil(
      async () => {
        found = await outputOf(id);
        if (!found) throw new Error(`No output for ${id} yet.`);
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

  beforeAll(() => {
    process.env.SHELL = testShell;
  });
  afterAll(() => {
    if (originalShell === undefined) delete process.env.SHELL;
    else process.env.SHELL = originalShell;
  });

  beforeEach(async () => {
    // The workspace's remote objects are placed on the server host.
    const host = createHost<RuntimePrincipal>({address: ServerHost(), principal: {kind: "server"}, onError: (error) => console.error(error)});
    await host.load([{name: "workspace", facet: workspaceFacet(new Workspace({terminals}), terminals)}], context);
    const [down, up] = memoryLinkPair();
    host.accept(down, {principal: {kind: "owner"}}, context);
    client = createHost<RuntimePrincipal>({onError: () => undefined});
    client.connect(up, {principal: {kind: "server"}}, context);
    await client.load([], context);
    const held = await client.get(WorkspaceService, {}, context);
    if (held.variant !== "owner") throw new Error("The owner's workspace variant did not bind.");
    workspaceOwner = held;
    closeHosts = async () => {
      for (const held of shown.values()) held.release();
      shown.clear();
      await client.close(context);
      await host.close(context);
    };
  });

  afterEach(async () => {
    await terminals.dispose();
    await closeHosts();
    cleanupTempDirs(tempDirs);
  });

  it("runs a shell in the requested directory, lists it without output, and keeps its output separately", async () => {
    const cwd = await workspace();
    const terminal = await terminals.open({cols: 80, cwd, id: "t1", rows: 24, sessionId: "s1"});
    expect(terminal).toEqual({cwd, id: "t1", number: 1, sessionId: "s1", startedAt: expect.any(String)});

    await terminals.write({data: shellCommand("pwd", "cd"), id: "t1"});
    await output("t1", (current) => expect(current.output).toContain(cwd));
    expect(list()).toEqual({t1: terminal});
    expect(terminals.list()).toEqual([terminal]);
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
    await terminals.write({data: shellCommand("echo MARKER_$((40+2))", "node -p \"'MARKER_' + (40+2)\""), id: "t2"});
    await output("t2", (current) => expect(current.output).toContain("MARKER_42"));
    // A watch that starts later receives the history at once.
    const watch = await watchOutput("t2");
    expect(watch.value.output).toContain("MARKER_42");
    await watch.stop();

    await terminals.write({data: shellCommand("exit 3", "exit 3"), id: "t2"});
    const exited = await output("t2", (current) => expect(current.exitCode).toBe(3));
    expect(exited.closed).toBeUndefined();
    await waitUntil(() => expect(list().t2?.exitCode).toBe(3));
    // Writes to an exited shell are dropped, not errors.
    await terminals.write({data: "ignored\n", id: "t2"});
  });

  it("closing kills the shell and ends its output, and closing a session kills all of its shells", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "a", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "b", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "c", rows: 24, sessionId: "s2"});
    // A client is showing "a" when it closes.
    await outputOf("a");

    await terminals.close({id: "a"});
    // Its output stays for the clients still showing it, marked closed; the list drops it.
    await output("a", (current) => expect(current.closed).toBe(true));
    await waitUntil(() => expect(list().a).toBeUndefined());
    expect(terminals.has("a")).toBe(false);
    await expect(terminals.write({data: "x", id: "a"})).rejects.toMatchObject({_tag: "TerminalNotFoundError"});

    await terminals.closeSession("s1");
    await waitUntil(() => expect(Object.keys(list())).toEqual(["c"]));
  });

  // POSIX only: cmd.exe has no way to ignore the hang-up, so Windows never needs the forced kill.
  it.skipIf(process.platform === "win32")("closing waits for the shell to exit, and forces one that ignores the hang-up", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "stubborn", rows: 24, sessionId: "s1"});
    // A shell that ignores SIGHUP, as a program trapping it would; only the forced kill after the grace period ends it.
    await terminals.write({data: "trap '' HUP; echo TRAPPED_$((1+1))\n", id: "stubborn"});
    await output("stubborn", (current) => expect(current.output).toContain("TRAPPED_2"));

    const started = Date.now();
    await Promise.all([terminals.close({id: "stubborn"}), terminals.close({id: "stubborn"}), terminals.dispose()]);

    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    await output("stubborn", (current) => expect(current.closed).toBe(true));
    await waitUntil(() => expect(list()).toEqual({}));
  });

  it("caps the scrollback from the front and counts what it dropped", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "big", rows: 24, sessionId: "s1"});
    // About 400 KB of output, past the 256 KB cap.
    await terminals.write({
      data: shellCommand(
        "yes 0123456789012345678901234567890123456789 | head -n 9000; echo DONE_$((1+1))",
        "node -e \"process.stdout.write(('0123456789012345678901234567890123456789\\n').repeat(9000)); console.log('DONE_' + (1+1))\""
      ),
      id: "big",
    });
    // Computed by the shell, so the echoed command line does not match.
    const capped = await output("big", (current) => expect(current.output).toContain("DONE_2"));
    expect(capped.output.length).toBeLessThanOrEqual(256 * 1024);
    expect(capped.dropped).toBeGreaterThan(0);
    // What is kept and what was dropped add up to everything the shell wrote, so a client can tell where it is.
    expect(capped.output.length + capped.dropped).toBeGreaterThan(9000 * 41);
  });

  it("publishes output as appends, never the whole buffer, until it trims", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "ops", rows: 24, sessionId: "s1"});
    await output("ops", () => undefined);
    const watch = await watchOutput("ops");
    const ops: (readonly unknown[])[] = [];
    watch.start(async (call) => {
      if (call.kind === "value") ops.push(...call.ops);
    });
    await terminals.write({data: shellCommand("echo APPENDED_$((1+1))", "echo APPENDED_2"), id: "ops"});
    await output("ops", (current) => expect(current.output).toContain("APPENDED_2"));
    await waitUntil(() => expect(ops.length).toBeGreaterThan(0));
    await watch.stop();

    // Each chunk is an append to `output`; none replaces the document or the string.
    expect(ops.every((op) => op[0] === "a" && JSON.stringify(op[1]) === JSON.stringify(["output"]))).toBe(true);
  });

  it("reopening an id attaches to the running shell instead of starting another", async () => {
    const cwd = await workspace();
    const first = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    const second = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    expect(second).toEqual(first);
    await waitUntil(() => expect(Object.keys(list())).toEqual(["same"]));
  });
});
