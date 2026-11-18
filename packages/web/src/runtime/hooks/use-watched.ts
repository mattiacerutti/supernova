import type {Watchable} from "@earendil-works/chord";
import {watchStore} from "@earendil-works/chord/react";
import {useMemo, useSyncExternalStore} from "react";

// Chord's `useWatch` re-renders on every change of the whole value; this re-renders only when the selected part changes.
export function useWatched<T, S>(source: Watchable<T> | undefined, select: (value: T | undefined) => S): S {
  const store = useMemo(() => watchStore(source), [source]);
  const read = () => select(store.snapshot());
  return useSyncExternalStore(store.subscribe, read, read);
}
