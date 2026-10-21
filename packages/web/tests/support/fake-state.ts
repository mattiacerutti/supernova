import type {Draft, Readable} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";

/** State a fake service owns: what a contract state member reads, plus the writes the server would make. */
export interface FakeState<T> extends Readable<T> {
  replace(value: T): void;
  change(mutate: (draft: Draft<T>) => void): void;
}

/** A contract state member over local state; subscribers get the current value at once and every later one, synchronously. */
export function fakeState<T extends object>(initial: T): FakeState<T> {
  const state = replicatedState(initial);
  return {
    get value() {
      return state.value;
    },
    subscribe: (listener) => state.subscribe((value) => listener(value)),
    events: (listener) => state.subscribe((value, _context, delivery) => listener({type: delivery.kind === "hydrate" ? "snap" : "reset", value})),
    replace: (value) => state.replace(BACKGROUND_CONTEXT, value),
    change: (mutate) => state.change(BACKGROUND_CONTEXT, mutate),
  };
}
