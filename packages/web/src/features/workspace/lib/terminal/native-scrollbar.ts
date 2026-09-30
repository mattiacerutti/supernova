import type {Terminal as GhosttyTerminal} from "ghostty-web";

/**
 * Replaces ghostty-web's canvas-drawn overlay scrollbar with the app's native one. An empty scroller sits beside the
 * canvas; its content height mirrors the terminal's scrollback and the two positions are kept in sync, so wheel input
 * on the canvas and drags on the native thumb both move the same viewport.
 *
 * ghostty-web has no option to hide its scrollbar, so the renderer's private draw method is neutralised per instance.
 */
export interface NativeScrollbar {
  readonly detach: () => void;
  /** Call after writing output: scrollback grows without a scroll event, and ghostty-web's `onRender` never fires. */
  readonly sync: () => void;
}

export function attachNativeScrollbar(terminal: GhosttyTerminal, scroller: HTMLDivElement): NativeScrollbar {
  const renderer = terminal.renderer as unknown as {renderScrollbar?: () => void} | undefined;
  if (renderer) renderer.renderScrollbar = () => undefined;
  const spacer = scroller.firstElementChild as HTMLElement;

  let syncing = false;
  const lineHeight = (): number => terminal.renderer?.getMetrics().height ?? 16;

  /** Terminal → scroller. `viewportY` counts lines from the bottom; the scroller counts pixels from the top. */
  const syncScroller = (): void => {
    const scrollback = terminal.getScrollbackLength();
    const height = lineHeight();
    spacer.style.height = `${(scrollback + terminal.rows) * height}px`;
    scroller.style.visibility = scrollback > 0 ? "visible" : "hidden";
    const top = (scrollback - terminal.viewportY) * height;
    if (Math.abs(scroller.scrollTop - top) < 1) return;
    syncing = true;
    scroller.scrollTop = top;
    // The scroll event fires asynchronously; release the guard after it.
    window.requestAnimationFrame(() => (syncing = false));
  };

  /** Scroller → terminal. */
  const handleScroll = (): void => {
    if (syncing) return;
    const line = terminal.getScrollbackLength() - Math.round(scroller.scrollTop / lineHeight());
    if (line !== terminal.viewportY) terminal.scrollToLine(line);
  };

  const scroll = terminal.onScroll(syncScroller);
  const resize = terminal.onResize(syncScroller);
  scroller.addEventListener("scroll", handleScroll, {passive: true});
  syncScroller();

  // Writes are processed asynchronously; one sync per frame covers a burst of output.
  let pendingSync: number | undefined;
  const sync = (): void => {
    if (pendingSync !== undefined) return;
    pendingSync = window.requestAnimationFrame(() => {
      pendingSync = undefined;
      syncScroller();
    });
  };

  return {
    detach: () => {
      if (pendingSync !== undefined) window.cancelAnimationFrame(pendingSync);
      scroll.dispose();
      resize.dispose();
      scroller.removeEventListener("scroll", handleScroll);
    },
    sync,
  };
}
