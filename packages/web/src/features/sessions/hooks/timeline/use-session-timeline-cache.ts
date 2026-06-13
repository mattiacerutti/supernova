import {useCallback, useLayoutEffect, useMemo} from "react";
import type {RefObject} from "react";
import type {VirtualizerHandle} from "virtua";

export type SessionTimelineCache = VirtualizerHandle["cache"];
export type SessionTimelineVirtualizerHandle = VirtualizerHandle & {readonly measure?: () => void};

interface UseSessionTimelineCacheInput {
  /** Ordered virtual row ids. The cache is reused only when this exact order matches. */
  readonly rowKeys: readonly string[];
  /** Session identity used to partition cached measurements. */
  readonly sessionId: string;
  /** Shared virtua handle owned by the timeline auto-scroll hook. */
  readonly virtualizerRef: RefObject<SessionTimelineVirtualizerHandle | null>;
}

interface UseSessionTimelineCacheResult {
  /** Virtua cache for this exact session and row order, if one exists. */
  readonly cache: SessionTimelineCache | undefined;
  /** Callback ref wrapper that stores/restores ownership for virtua's imperative handle. */
  readonly setVirtualizer: (handle: VirtualizerHandle | null) => void;
}

const TIMELINE_CACHE_LIMIT = 16;

// Virtua measurement snapshots are valid only for the exact row order measured.
const timelineCache = new Map<string, {cache: SessionTimelineCache; keys: readonly string[]}>();

function sameKeys(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((key, index) => key === b[index]);
}

function readTimelineCache(id: string, keys: readonly string[]): SessionTimelineCache | undefined {
  const entry = timelineCache.get(id);
  if (!entry) return undefined;
  if (sameKeys(entry.keys, keys)) return entry.cache;

  timelineCache.delete(id);
  return undefined;
}

function writeTimelineCache(sessionId: string, rowKeys: readonly string[], handle: SessionTimelineVirtualizerHandle | null): void {
  if (!handle || rowKeys.length === 0) return;

  timelineCache.delete(sessionId);
  timelineCache.set(sessionId, {cache: handle.cache, keys: rowKeys.slice()});
  while (timelineCache.size > TIMELINE_CACHE_LIMIT) timelineCache.delete(timelineCache.keys().next().value!);
}

/** Owns virtua measurement cache lifetime for the session timeline. */
export function useSessionTimelineCache(input: UseSessionTimelineCacheInput): UseSessionTimelineCacheResult {
  const {rowKeys, sessionId, virtualizerRef} = input;
  const cache = useMemo(() => readTimelineCache(sessionId, rowKeys), [rowKeys, sessionId]);

  const setVirtualizer = useCallback(
    (handle: VirtualizerHandle | null): void => {
      if (!handle) {
        writeTimelineCache(sessionId, rowKeys, virtualizerRef.current);
        virtualizerRef.current = null;
        return;
      }

      virtualizerRef.current = handle as SessionTimelineVirtualizerHandle;
    },
    [rowKeys, sessionId, virtualizerRef]
  );

  useLayoutEffect(
    () => () => {
      writeTimelineCache(sessionId, rowKeys, virtualizerRef.current);
    },
    [rowKeys, sessionId, virtualizerRef]
  );

  return {cache, setVirtualizer};
}
