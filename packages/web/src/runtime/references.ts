import type {Contract, Held, RefIn, RefState, Watchable} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import type {NativeWatchable} from "@earendil-works/chord/watch";

const context = BACKGROUND_CONTEXT;

export type HeldRef = {readonly state: NativeWatchable<RefState>; release(): void};

export type OwnerOf<C extends Contract> = RefIn<C, "owner">;

export function follow<T>(source: Watchable<T> | NativeWatchable<T>, listener: (value: T) => void): () => void {
  let stopped = false;
  let stop: (() => void) | undefined;
  let last: {readonly value: T} | undefined;
  const deliver = (value: T) => {
    if (stopped || (last !== undefined && last.value === value)) return;
    last = {value};
    listener(value);
  };
  // A member read before its first value throws; that value then arrives through the watch.
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

export function whenLive(ref: HeldRef): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = follow(ref.state, (state) => {
      if (state.kind === "live") resolve();
      else if (state.kind === "ended") reject(state.error);
      else if (state.kind === "failed" && state.cause.kind !== "transient") reject(state.cause.error);
      else return;
      // `stop` does not exist yet when `follow` calls back at once.
      queueMicrotask(() => stop());
    });
  });
}

export function asOwner<C extends Contract>(held: Held<C>): OwnerOf<C> {
  // The server gives a browser only the owner variant.
  return held as unknown as OwnerOf<C>;
}
