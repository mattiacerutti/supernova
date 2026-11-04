import type {Watchable} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {NativeWatchable} from "@earendil-works/chord/watch";

const context = BACKGROUND_CONTEXT;

/** Delivers the watch's starting value too: a change landing while the watch is acquired would be lost otherwise. */
export function follow<T>(source: Watchable<T> | NativeWatchable<T>, listener: (value: T) => void): () => void {
  let stopped = false;
  let stop: (() => void) | undefined;
  let last: {readonly value: T} | undefined;
  const deliver = (value: T) => {
    if (stopped || (last !== undefined && last.value === value)) return;
    last = {value};
    listener(value);
  };
  /** Reading a member before its first value throws; that value then arrives through the watch. */
  const deliverCurrent = (read: () => T) => {
    try {
      deliver(read());
    } catch {
      return;
    }
  };
  deliverCurrent(() => source.value);
  void source.watch(context).then(
    (watch) => {
      if (stopped) return void watch.stop();
      stop = () => void watch.stop();
      deliverCurrent(() => watch.value);
      (watch as {start(listener: (call: {readonly kind: string; readonly value?: T}) => Promise<void>): void}).start(async (call) => {
        if (call.kind === "value") deliver(call.value as T);
      });
    },
    () => undefined
  );
  return () => {
    stopped = true;
    stop?.();
  };
}
