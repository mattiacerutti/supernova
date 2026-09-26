export const MIN_CONTENT_WIDTH = 480;

/** Floored at the panel minimum: when nothing fits the content yields, and `max < min` would overwrite the stored width. */
export function maxPanelWidth(availableWidth: number, minWidth: number, reservedWidth = 0): number {
  return Math.max(minWidth, availableWidth - reservedWidth - MIN_CONTENT_WIDTH);
}

/** The same clamp as CSS, so a window resize re-fits without a store write. */
export function clampedPanelWidth(width: number, minWidth: number, reservedWidth = 0): string {
  return `max(${minWidth}px, min(${width}px, 100cqw - ${reservedWidth + MIN_CONTENT_WIDTH}px))`;
}
