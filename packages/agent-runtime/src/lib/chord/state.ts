import type {Self, Watchable} from "@earendil-works/chord";

export interface Published<T> {
  readonly member: Watchable<T>;
  set(value: T): void;
}

export function published<T>(self: Pick<Self, "writable" | "derive">, initial: T): Published<T> {
  // A writable is never a member, so a derive exposes it; cast because interfaces and Pi's types fail `JsonValue`.
  const writable = self.writable(initial);
  const member = (self.derive as (sources: readonly unknown[], compute: (values: readonly [T]) => T) => Watchable<T>)([writable], ([value]) => value);
  return {member, set: (value) => writable.set(value)};
}

export function following<T>(self: Pick<Self, "writable" | "derive" | "open">, read: () => T, subscribe: (changed: () => void) => () => void): Published<T> & {refresh(): void} {
  const value = published(self, read());
  const refresh = () => value.set(read());
  self.open(
    async () => subscribe(refresh),
    (stop) => stop()
  );
  return {...value, refresh};
}
