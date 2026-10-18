import {afterEach, expect, it, vi} from "vitest";
import {TerminalProcess} from "@supernova/agent-runtime/features/workspace/terminals/terminal-process";
import type {SpawnPtyInput} from "@supernova/agent-runtime/features/workspace/terminals/pty";

afterEach(() => vi.useRealTimers());

it.each([false, true])("waits for terminal exit before completing close (forced: %s)", async (forced) => {
  vi.useFakeTimers();
  let events!: SpawnPtyInput;
  const signals: string[] = [];
  const terminal = await TerminalProcess.spawn({
    cols: 80,
    cwd: process.cwd(),
    id: "terminal",
    rows: 24,
    sessionId: "session",
    onOutput: () => undefined,
    onExit: () => undefined,
    spawnPty: async (input) => {
      events = input;
      return {pid: 1, kill: (signal) => void signals.push(signal), resize: () => undefined, write: () => undefined};
    },
  });

  let closed = false;
  const closing = Promise.resolve(terminal.close()).then(() => void (closed = true));
  const again = terminal.close();
  await vi.advanceTimersByTimeAsync(0);
  expect(closed).toBe(false);
  expect(signals).toEqual(["SIGHUP"]);

  if (forced) await vi.advanceTimersByTimeAsync(1_000);
  expect(signals).toEqual(forced ? ["SIGHUP", "SIGKILL"] : ["SIGHUP"]);
  events.onExit(0);
  await Promise.all([closing, again]);
  expect(closed).toBe(true);
  await vi.advanceTimersByTimeAsync(2_000);
  expect(signals).toEqual(forced ? ["SIGHUP", "SIGKILL"] : ["SIGHUP"]);
});
