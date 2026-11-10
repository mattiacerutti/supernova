import type {Self, Watchable, Writable} from "@earendil-works/chord";
import {constant} from "@earendil-works/chord";
import type {NativeWatchable} from "@earendil-works/chord/watch";

// What a class sets for its object to publish: the object passes in a `self.writable`, tests a plain holder.
export type Published<T> = Pick<Writable<T>, "value" | "set">;

type Sources = readonly (Watchable<unknown> | NativeWatchable<unknown>)[];
type ValuesOf<S extends Sources> = {readonly [I in keyof S]: S[I] extends Watchable<infer V> ? V : S[I] extends NativeWatchable<infer V> ? V : never};

// The casts: interfaces and Pi's types fail Chord's `JsonValue` although their values are JSON.
export function derivedState<const S extends Sources, T>(self: Pick<Self, "derive">, sources: S, compute: (values: ValuesOf<S>) => T): Watchable<T> {
  return (self.derive as (sources: S, compute: (values: ValuesOf<S>) => T) => Watchable<T>)(sources, compute);
}

export function constantState<T>(value: T): Watchable<T> {
  return (constant as (value: T) => Watchable<T>)(value);
}
