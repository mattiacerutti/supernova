export const MIN_CONTENT_WIDTH = 480;

// Animate visibility, never the fitted width: container changes must apply immediately.
export const PANEL_TRANSITION = "transition-[--panel-open] duration-250 ease-in-out motion-reduce:transition-none";

/** Floored at the panel minimum: when nothing fits the content yields, and `max < min` would overwrite the stored width. */
export function maxPanelWidth(availableWidth: number, minWidth: number, reservedWidth = 0): number {
  return Math.max(minWidth, availableWidth - reservedWidth - MIN_CONTENT_WIDTH);
}

/** CSS owns fitting; JavaScript only supplies the user's width and drag bounds. */
export function clampedPanelWidth(width: number, minWidth: number, reservedWidth = 0): string {
  return `max(${minWidth}px, min(${width}px, 100cqw - ${reservedWidth + MIN_CONTENT_WIDTH}px))`;
}

/** Remember CSS-constrained widths so making room again only grows the content, not the panels. Observe the unanimated inner surface, never the collapsing wrapper. */
export function observePanelWidth(element: HTMLElement, width: number, onShrink: (width: number) => void): () => void {
  const observer = new ResizeObserver(([entry]) => {
    if (!entry) return;
    const fittedWidth = Math.round(entry.contentRect.width);
    if (fittedWidth > 0 && fittedWidth < width) onShrink(fittedWidth);
  });
  observer.observe(element);
  return () => observer.disconnect();
}
