import {useSyncExternalStore} from "react";

const MINUTE_MS = 60_000;

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let nowMs = Date.now();

/** Re-arms at each minute boundary from a fresh clock read, so a throttled or suspended timer corrects itself when it fires. */
function schedule(): void {
  timer = setTimeout(
    () => {
      nowMs = Date.now();
      for (const listener of listeners) listener();
      schedule();
    },
    MINUTE_MS - (Date.now() % MINUTE_MS)
  );
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) schedule();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    clearTimeout(timer);
    timer = undefined;
  };
}

function getNow(): number {
  // Without a running timer the stored time may be stale; while one runs, it must stay stable between notifications.
  if (timer === undefined) nowMs = Date.now();
  return nowMs;
}

function format(value: string, now: number): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";

  const minutes = Math.floor((now - timestamp) / MINUTE_MS);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`;
}

/** A compact label for how long ago `value` was, refreshed each minute. One shared timer serves every label. */
export function useRelativeTime(value: string): string {
  return format(value, useSyncExternalStore(subscribe, getNow));
}
