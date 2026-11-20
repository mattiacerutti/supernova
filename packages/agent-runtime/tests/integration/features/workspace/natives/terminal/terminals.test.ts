import {existsSync} from "node:fs";
import {chmod, mkdtemp, readFile, realpath, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import type {Host} from "@earendil-works/chord";
import {createHost, memoryLinkPair} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ServerHost} from "@supernova/contracts/lib/protocol";
import {TERMINAL_CLOSED_CODE, TERMINAL_RETRY_CODE} from "@supernova/contracts/services/workspace/schemas";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import {TerminalsNative} from "@supernova/agent-runtime/features/workspace/contract";
import {workspaceFacet} from "@supernova/agent-runtime/features/workspace/facet";
import type {Terminals} from "@supernova/agent-runtime/features/workspace/natives/terminal/terminals";
import {cleanupTempDirs, waitUntil} from "@tests/support/async";
import {shellCommand, testShell, TestViewer} from "@tests/support/terminal";

const posixIt = it.skipIf(process.platform === "win32");
const quote = (path: string) => `'${path.replaceAll("'", "'\\''")}'`;

describe("Terminals", () => {
  const tempDirs: string[] = [];
  let terminals: Terminals;
  let client: Host<RuntimePrincipal>;
  let closeHosts = async (): Promise<void> => undefined;
  let workspaceOwner: {readonly terminals: {readonly value: {readonly terminals: Readonly<Record<string, {readonly exitCode?: number}>>}}};
  const list = () => workspaceOwner.terminals.value.terminals;
  const holds: {release(): void}[] = [];

  const hold = async (id: string) => {
    const held = await client.get(TerminalService, {terminalId: id}, context);
    if (held.variant !== "owner") throw new Error("The owner's terminal variant did not bind.");
    holds.push(held);
    return held;
  };
  type Spoiled = {readonly token: string; readonly held: Awaited<ReturnType<typeof hold>>};
  const view = async (id: string, options?: ConstructorParameters<typeof TestViewer>[0]) => {
    const held = await hold(id);
    const viewer = new TestViewer(options);
    const {token} = await held.channel(context);
    expect(terminals.admit(token)).toEqual({kind: "admitted"});
    terminals.connect(token, viewer.socket);
    await waitUntil(() => expect(viewer.resets).toBe(1));
    return {held, viewer};
  };
  const shows = async (viewer: TestViewer, expected: string) => {
    await waitUntil(async () => expect(await viewer.text()).toContain(expected), {timeoutMs: 5_000});
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
    const host = createHost<RuntimePrincipal>({address: ServerHost(), principal: {kind: "server"}, onError: (error) => console.error(error)});
    await host.load([{name: "workspace", facet: workspaceFacet}], context);
    // The server's own class behind the store, as the other objects on its host reach it.
    terminals = (await host.registry(TerminalsNative, context)).value!.value;
    const [down, up] = memoryLinkPair();
    host.accept(down, {principal: {kind: "owner"}}, context);
    client = createHost<RuntimePrincipal>({onError: () => undefined});
    client.connect(up, {principal: {kind: "server"}}, context);
    await client.load([], context);
    const held = await client.get(WorkspaceService, {}, context);
    if (held.variant !== "owner") throw new Error("The owner's workspace variant did not bind.");
    workspaceOwner = held;
    closeHosts = async () => {
      for (const held of holds.splice(0)) held.release();
      await client.close(context);
      await host.close(context);
    };
  });

  afterEach(async () => {
    await closeHosts();
    cleanupTempDirs(tempDirs);
  });

  it("runs a shell in the requested directory and lists it without its output", async () => {
    const cwd = await workspace();
    const terminal = await terminals.open({cols: 80, cwd, id: "t1", rows: 24, sessionId: "s1"});
    expect(terminal).toEqual({cwd, id: "t1", number: 1, sessionId: "s1", startedAt: expect.any(String)});

    const {viewer} = await view("t1");
    viewer.type(shellCommand("pwd", "cd"));
    await shows(viewer, cwd);
    expect(list()).toEqual({t1: terminal});
    expect(JSON.stringify(list())).not.toContain("pwd");
  });

  it("numbers a session's terminals with the smallest free number", async () => {
    const cwd = await workspace();
    expect((await terminals.open({cols: 80, cwd, id: "a", rows: 24, sessionId: "s1"})).number).toBe(1);
    expect((await terminals.open({cols: 80, cwd, id: "b", rows: 24, sessionId: "s1"})).number).toBe(2);
    expect((await terminals.open({cols: 80, cwd, id: "other", rows: 24, sessionId: "s2"})).number).toBe(1);
    await terminals.close({id: "a"});
    expect((await terminals.open({cols: 80, cwd, id: "c", rows: 24, sessionId: "s1"})).number).toBe(1);
  });

  it("gives a viewer that attaches later the screen, and both viewers the output after it", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "shared", rows: 24, sessionId: "s1"});
    const first = await view("shared");
    first.viewer.type(shellCommand("echo EARLY_$((1+1))", "node -p \"'EARLY_' + (1+1)\""));
    await shows(first.viewer, "EARLY_2");

    const second = new TestViewer();
    terminals.connect((await first.held.channel(context)).token, second.socket);
    await shows(second, "EARLY_2");

    second.type(shellCommand("echo LATER_$((2+1))", "node -p \"'LATER_' + (2+1)\""));
    await shows(first.viewer, "LATER_3");
    await shows(second, "LATER_3");
  });

  posixIt("restores a full-screen program for a viewer that attaches while it runs", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "alt", rows: 24, sessionId: "s1"});
    const {viewer: first} = await view("alt");
    // Enough output first that a replay of the last bytes could not know the alternate screen was entered.
    first.type("seq 1 3000; printf '\\033[?1049h\\033[H\\033[2JFULL_%s\\033[5;10HCURSOR' SCREEN; sleep 30\n");
    await waitUntil(async () => expect((await first.screen())[0]).toBe("FULL_SCREEN"), {timeoutMs: 5_000});

    const {viewer: later} = await view("alt");
    const screen = await later.screen();
    expect(later.terminal.buffer.active.type).toBe("alternate");
    expect(screen[0]).toBe("FULL_SCREEN");
    expect(screen[4]).toBe("         CURSOR");
    expect(screen.join("\n")).not.toContain("3000");
  });

  it("sizes the shell and the screen by the last resize, and a later viewer draws at that size", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "sized", rows: 24, sessionId: "s1"});
    const {held, viewer} = await view("sized");
    await held.resize({cols: 100, rows: 30}, context);
    await held.resize({cols: 90, rows: 20}, context);
    viewer.type(shellCommand("stty size", "node -p \"process.stdout.rows + ' ' + process.stdout.columns\""));
    await shows(viewer, "20 90");

    const {viewer: later} = await view("sized");
    expect(later.events[0]).toEqual({type: "reset", cols: 90, rows: 20});
    expect(later.terminal.cols).toBe(90);
  });

  it("stops sending to a viewer that falls behind, then catches it up with the current screen", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "flood", rows: 24, sessionId: "s1"});
    const {viewer: slow} = await view("flood", {acknowledge: false});
    const {viewer: fast} = await view("flood");

    fast.type(
      shellCommand(
        "yes 0123456789012345678901234567890123456789 | head -n 100000; echo DONE_$((1+1))",
        "node -e \"process.stdout.write(('0123456789012345678901234567890123456789\\n').repeat(100000)); console.log('DONE_' + (1+1))\""
      )
    );
    await shows(fast, "DONE_2");
    expect(fast.total).toBeGreaterThan(100_000 * 41);
    expect(slow.total).toBeLessThan(1024 * 1024);
    expect(await slow.text()).not.toContain("DONE_2");

    slow.acknowledge = true;
    slow.catchUp();
    await waitUntil(() => expect(slow.resets).toBe(2));
    await shows(slow, "DONE_2");
  });

  // Asks like a program: raw input, the query, then everything that arrives as input within two seconds, so a second
  // answer would show too. The reply goes to a file, so it can be read whether or not a viewer is attached.
  const asker = async (cwd: string) => {
    const script = join(cwd, "ask.sh");
    await writeFile(
      script,
      [
        "#!/bin/sh",
        "saved=$(stty -g); stty raw -echo min 0 time 20",
        'printf "$1"; printf "[asked]"; : > "$2.asked"',
        // Renamed once `dd` ends, so the reply is never read half written.
        'dd bs=1 count=64 2>/dev/null > "$2.part"; mv "$2.part" "$2"',
        'stty "$saved"',
      ].join("\n")
    );
    await chmod(script, 0o755);
    let asks = 0;
    return {
      /** Starts asking without waiting for the answer; `answer` waits for it. */
      ask: (viewer: TestViewer, query: string, before = "") => {
        const file = join(cwd, `reply-${(asks += 1)}`);
        viewer.type(`${before}${quote(script)} '${query}' ${quote(file)}\n`);
        return {
          asked: () => waitUntil(() => expect(existsSync(`${file}.asked`)).toBe(true), {timeoutMs: 8_000}),
          answer: async () => {
            await waitUntil(() => expect(existsSync(file)).toBe(true), {timeoutMs: 8_000});
            return readFile(file, "latin1");
          },
        };
      },
    };
  };
  posixIt("answers a program's cursor query exactly once, however many viewers show the terminal", async () => {
    const cwd = await workspace();
    const {ask} = await asker(cwd);
    await terminals.open({cols: 80, cwd, id: "asks", rows: 24, sessionId: "s1"});
    const {viewer: first} = await view("asks");
    await view("asks");
    expect(await ask(first, "\\033[6n").answer()).toMatch(/^\x1b\[\d+;\d+R$/);
  });

  posixIt("answers a query while the only viewer has fallen behind", async () => {
    const cwd = await workspace();
    const {ask} = await asker(cwd);
    await terminals.open({cols: 80, cwd, id: "behind", rows: 24, sessionId: "s1"});
    const {viewer} = await view("behind", {acknowledge: false});
    // Past the window, so this viewer receives nothing while the program asks.
    const question = ask(viewer, "\\033[6n", "yes 0123456789012345678901234567890123456789 | head -n 50000; ");
    await question.asked();
    expect(viewer.total).toBeLessThan(1024 * 1024);
    expect(await question.answer()).toMatch(/^\x1b\[\d+;\d+R$/);
  });

  posixIt("answers a query while no viewer shows the terminal", async () => {
    const cwd = await workspace();
    const {ask} = await asker(cwd);
    await terminals.open({cols: 80, cwd, id: "alone", rows: 24, sessionId: "s1"});
    const {viewer} = await view("alone");
    // The program waits a moment before asking, so the only viewer has left by then.
    const question = ask(viewer, "\\033[c", "sleep 0.5; ");
    viewer.disconnect();
    await question.asked();
    expect(await question.answer()).toMatch(/^\x1b\[\?[\d;]+c$/);
  });

  posixIt.each([
    {name: "background color", query: "\\033]11;?\\033\\\\", answer: "\x1b]11;rgb:fafa/fafa/fafa\x1b\\"},
    {name: "foreground color", query: "\\033]10;?\\033\\\\", answer: "\x1b]10;rgb:1010/1010/1010\x1b\\"},
    {name: "color scheme", query: "\\033[?996n", answer: "\x1b[?997;2n"},
  ])("answers a $name query from the colors the viewer reported", async ({query, answer}) => {
    const cwd = await workspace();
    const {ask} = await asker(cwd);
    await terminals.open({cols: 80, cwd, id: "colors", rows: 24, sessionId: "s1"});
    const {held, viewer} = await view("colors");
    await held.theme({background: 0xfafafa, foreground: 0x101010, scheme: "light"}, context);
    expect(await ask(viewer, query).answer()).toBe(answer);
  });

  posixIt("tells a program that asked to hear of scheme changes when the viewer's scheme changes", async () => {
    const cwd = await workspace();
    const {ask} = await asker(cwd);
    await terminals.open({cols: 80, cwd, id: "scheme", rows: 24, sessionId: "s1"});
    const {held, viewer} = await view("scheme");
    await held.theme({background: 0xfafafa, foreground: 0x101010, scheme: "light"}, context);
    // Subscribing has no answer, so the change made while the program waits is the only thing it can receive.
    const subscribed = ask(viewer, "\\033[?2031h");
    // Viewers get output once the server's screen parsed it, so the marker shows the subscription is in effect.
    await shows(viewer, "[asked]");
    await held.theme({background: 0x141414, foreground: 0xe6e6e6, scheme: "dark"}, context);
    expect(await subscribed.answer()).toBe("\x1b[?997;1n");
  });

  posixIt.each([
    {name: "inside an escape sequence", first: "START\\033[?104", rest: "9hALT", done: async (later: TestViewer) => expect(later.terminal.buffer.active.type).toBe("alternate")},
    {name: "inside a UTF-8 character", first: "START\\303", rest: "\\251ALT", done: async (later: TestViewer) => expect(await later.text()).toContain("STARTéALT")},
  ])("gives a viewer that attaches with output stopped $name the screen it completes", async ({first, rest, done}) => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "split", rows: 24, sessionId: "s1"});
    const {held, viewer} = await view("split");
    // The program holds the rest back until the late viewer has attached.
    const go = join(cwd, "go");
    viewer.type(`clear; printf '${first}'; while [ ! -e ${quote(go)} ]; do sleep 0.05; done; printf '${rest}'\n`);
    // The program's output, not the echoed command, which spells `START` too.
    await waitUntil(async () => expect(await viewer.text()).toMatch(/^START/m), {timeoutMs: 5_000});
    const later = new TestViewer();
    terminals.connect((await held.channel(context)).token, later.socket);
    await writeFile(go, "");
    await waitUntil(async () => expect(await later.text()).toContain("ALT"), {timeoutMs: 5_000});
    await done(later);
    expect(await later.text()).not.toContain("9h");
  });

  posixIt.each([
    {
      name: "scrolling margins",
      setup: "\\033[2;10r",
      check: (later: TestViewer) =>
        expect((later.terminal as unknown as {_core: {buffer: {scrollTop: number; scrollBottom: number}}})._core.buffer).toMatchObject({scrollTop: 1, scrollBottom: 9}),
    },
    {
      name: "the SGR mouse encoding",
      setup: "\\033[?1000h\\033[?1006h",
      check: (later: TestViewer) => expect((later.terminal as unknown as {_core: {coreMouseService: {activeEncoding: string}}})._core.coreMouseService.activeEncoding).toBe("SGR"),
    },
  ])("restores $name for a viewer that attaches later", async ({setup, check}) => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "modes", rows: 24, sessionId: "s1"});
    const {viewer} = await view("modes");
    viewer.type(`printf '${setup}SET'; sleep 30\n`);
    await waitUntil(async () => expect(await viewer.text()).toMatch(/^SET/m), {timeoutMs: 5_000});
    const {viewer: later} = await view("modes");
    await later.drawn();
    check(later);
  });

  it("reports the exit after the shell's last output, and keeps the exited terminal listed", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "exits", rows: 24, sessionId: "s1"});
    const {viewer} = await view("exits");
    viewer.type(shellCommand("echo BYE_$((1+1)); exit 3", "echo BYE_2 & exit 3"));
    await waitUntil(() => expect(viewer.events).toContainEqual({type: "exit", exitCode: 3}), {timeoutMs: 5_000});
    const exitAt = viewer.frames.findIndex((frame) => typeof frame !== "string" && frame.type === "exit");
    // On its own line: the echoed command contains `BYE_$((1+1))`, not `BYE_2`.
    expect(viewer.frames.slice(0, exitAt).join("")).toMatch(/^BYE_2\r?$/m);
    await waitUntil(() => expect(list().exits?.exitCode).toBe(3));
  });

  it("tells a viewer that attaches after the exit, and drops its input", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "exited", rows: 24, sessionId: "s1"});
    const {viewer} = await view("exited");
    viewer.type(shellCommand("exit 3", "exit 3"));
    await waitUntil(() => expect(list().exited?.exitCode).toBe(3), {timeoutMs: 5_000});

    const {viewer: later} = await view("exited");
    expect(later.events).toContainEqual({type: "exit", exitCode: 3});
    later.type("ignored\n");
    expect(later.closedWith).toBeUndefined();
  });

  it("closing a terminal kills its shell, closes its viewers and drops it from the list", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "a", rows: 24, sessionId: "s1"});
    const {held, viewer} = await view("a");

    await terminals.close({id: "a"});
    expect(viewer.closedWith).toBe(TERMINAL_CLOSED_CODE);
    await waitUntil(() => expect(list().a).toBeUndefined());
    await expect(held.resize({cols: 10, rows: 10}, context)).rejects.toMatchObject({code: "TerminalNotFoundError"});
  });

  it("closing a session closes its terminals and no other session's", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "a", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "b", rows: 24, sessionId: "s1"});
    await terminals.open({cols: 80, cwd, id: "c", rows: 24, sessionId: "s2"});

    await terminals.closeSession("s1");
    await waitUntil(() => expect(Object.keys(list())).toEqual(["c"]));
  });

  // POSIX only: cmd.exe has no way to ignore the hang-up, so Windows never needs the forced kill.
  posixIt("closing waits for the shell to exit, and forces one that ignores the hang-up", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "stubborn", rows: 24, sessionId: "s1"});
    const {viewer} = await view("stubborn");
    // A shell that ignores SIGHUP, as a program trapping it would; only the forced kill after the grace period ends it.
    viewer.type("trap '' HUP; echo TRAPPED_$((1+1))\n");
    await shows(viewer, "TRAPPED_2");

    const started = Date.now();
    await Promise.all([terminals.close({id: "stubborn"}), terminals.close({id: "stubborn"}), terminals.dispose()]);

    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(viewer.closedWith).toBe(TERMINAL_CLOSED_CODE);
    await waitUntil(() => expect(list()).toEqual({}));
  });

  it.each([
    {name: "an unknown token", status: 403, spoil: async () => "not-a-token"},
    {name: "a token already spent", status: 403, spoil: async ({token}: Spoiled) => (terminals.connect(token, new TestViewer().socket), token)},
    {
      name: "a token whose hold ended",
      status: 403,
      spoil: async ({token, held}: Spoiled) => {
        // The release reaches the server asynchronously; a viewer the hold admitted closing shows it arrived.
        const admitted = new TestViewer();
        terminals.connect((await held.channel(context)).token, admitted.socket);
        held.release();
        await waitUntil(() => expect(admitted.closedWith).toBe(TERMINAL_CLOSED_CODE));
        return token;
      },
    },
    {name: "a token for a closed terminal", status: 404, spoil: async ({token}: Spoiled) => (await terminals.close({id: "guarded"}), token)},
  ])("refuses $name", async ({spoil, status}) => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "guarded", rows: 24, sessionId: "s1"});
    const held = await hold("guarded");
    const token = await spoil({token: (await held.channel(context)).token, held});

    expect(terminals.admit(token)).toEqual({kind: "refused", status});
    const refused = new TestViewer();
    terminals.connect(token, refused.socket);
    expect(refused.closedWith).toBe(TERMINAL_CLOSED_CODE);
  });

  it.each(["echo hi", "null", '{"type":"ack","bytes":-1}'])("closes a viewer that sends the text frame %s", async (text) => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "strict", rows: 24, sessionId: "s1"});
    const {viewer} = await view("strict");
    viewer.sendText(text);
    expect(viewer.closedWith).toBe(1003);
  });

  it("refuses a token for a terminal that closed and reopened under its id", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "reused", rows: 24, sessionId: "s1"});
    const held = await hold("reused");
    const {token} = await held.channel(context);
    await terminals.close({id: "reused"});
    await terminals.open({cols: 80, cwd, id: "reused", rows: 24, sessionId: "s1"});

    expect(terminals.admit(token)).toEqual({kind: "refused", status: 404});
  });

  it("closes a viewer whose token expired with a code that lets it reconnect", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "expiring", rows: 24, sessionId: "s1"});
    const held = await hold("expiring");
    const {token} = await held.channel(context);
    vi.setSystemTime(Date.now() + 31_000);
    try {
      const viewer = new TestViewer();
      terminals.connect(token, viewer.socket);
      expect(viewer.closedWith).toBe(TERMINAL_RETRY_CODE);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes a held object's viewers when the hold ends, without closing the shell", async () => {
    const cwd = await workspace();
    await terminals.open({cols: 80, cwd, id: "kept", rows: 24, sessionId: "s1"});
    const {held, viewer} = await view("kept");

    held.release();
    await waitUntil(() => expect(viewer.closedWith).toBe(TERMINAL_CLOSED_CODE));
    expect(terminals.has("kept")).toBe(true);
  });

  it("refuses to hold an unknown terminal", async () => {
    await expect(client.get(TerminalService, {terminalId: "missing"}, context, {readyTimeout: 500})).rejects.toThrow("Terminal not found.");
  });

  it("reopening an id attaches to the running shell instead of starting another", async () => {
    const cwd = await workspace();
    const first = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    const second = await terminals.open({cols: 80, cwd, id: "same", rows: 24, sessionId: "s1"});
    expect(second).toEqual(first);
    await waitUntil(() => expect(Object.keys(list())).toEqual(["same"]));
  });
});
