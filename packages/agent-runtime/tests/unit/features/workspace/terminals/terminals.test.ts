import {afterEach, expect, it, vi} from "vitest";
import {Terminals} from "@supernova/agent-runtime/features/workspace/terminals/terminals";
import type {SpawnPtyInput} from "@supernova/agent-runtime/features/workspace/terminals/pty";

afterEach(() => vi.useRealTimers());

it.each([false, true])("waits for terminal exit before completing close (forced: %s)", async (forced) => {
  vi.useFakeTimers();
  let events!: SpawnPtyInput;
  const signals: string[] = [];
  const terminals = new Terminals({
    spawnPty: async (input) => {
      events = input;
      return {pid: 1, kill: (signal) => void signals.push(signal), resize: () => undefined, write: () => undefined};
    },
  });

  await terminals.open({cols: 80, cwd: process.cwd(), id: "terminal", rows: 24, sessionId: "session"});

  const completed: string[] = [];
  const closing = terminals.close({id: "terminal"}).then(() => completed.push("close"));
  const again = terminals.close({id: "terminal"}).then(() => completed.push("again"));
  const disposing = terminals.dispose().then(() => completed.push("dispose"));
  await vi.advanceTimersByTimeAsync(0);
  expect(completed).toEqual([]);
  expect(signals).toEqual(["SIGHUP"]);

  if (forced) await vi.advanceTimersByTimeAsync(1_000);
  expect(signals).toEqual(forced ? ["SIGHUP", "SIGKILL"] : ["SIGHUP"]);
  events.onExit(0);
  await Promise.all([closing, again, disposing]);
  expect(completed.sort()).toEqual(["again", "close", "dispose"]);
  expect(terminals.state.value.terminals).toEqual({});
  await vi.advanceTimersByTimeAsync(2_000);
  expect(signals).toEqual(forced ? ["SIGHUP", "SIGKILL"] : ["SIGHUP"]);
});
