import type {Self, Watchable} from "@earendil-works/chord";

export interface Published<T> {
  readonly member: Watchable<T>;
  /** Chord sends clients the diff from the last value. */
  set(value: T): void;
}

/** A writable is never a member; a derive puts it on the wire. Typed here: interfaces and Pi's types fail `JsonValue`. */
export function published<T>(self: Pick<Self, "writable" | "derive">, initial: T): Published<T> {
  const writable = self.writable(initial);
  const member = (self.derive as (sources: readonly unknown[], compute: (values: readonly [T]) => T) => Watchable<T>)([writable], ([value]) => value);
  return {member, set: (value) => writable.set(value)};
}
