import type {Watchable} from "@earendil-works/chord";
import type {Context} from "@earendil-works/chord/context";
import type {Draft} from "@earendil-works/chord/delta";
import {Watch} from "@earendil-works/chord/watch";

/** Watches get a write asynchronously, as a held member does; a write resolves once its watchers have it. */
export interface FakeState<T> extends Watchable<T> {
  replace(value: T): Promise<void>;
  change(mutate: (draft: Draft<T>) => void): Promise<void>;
}

export function fakeState<T extends object>(initial: T): FakeState<T> {
  let value = initial;
  const watches = new Set<Watch<T>>();
  const publish = async (next: T) => {
    value = next;
    for (const watch of watches) watch.advance({kind: "value", value: next, ops: [["r", next as never]], retired: false}, {} as Context);
    // A watch delivers on a later task.
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    get value() {
      return value;
    },
    async watch() {
      const watch: Watch<T> = new Watch(
        value,
        () => watches.delete(watch),
        () => undefined
      );
      watches.add(watch);
      return watch;
    },
    replace: publish,
    change: (mutate) => {
      const draft = structuredClone(value) as Draft<T>;
      mutate(draft);
      return publish(draft as T);
    },
  };
}
