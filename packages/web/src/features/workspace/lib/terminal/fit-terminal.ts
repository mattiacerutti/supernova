import type {Terminal} from "@xterm/xterm";

/** xterm's vertical scrollbar width when `overviewRuler.width` is not set (`ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH`). */
const SCROLLBAR_WIDTH = 14;

/**
 * Private renderer surface of xterm.js 6.0.0: cell size in CSS pixels, and the row painter. `@xterm/addon-fit` reads
 * the same `_core._renderService` for its measurements, so this is no more fragile than the addon would be.
 */
interface Core {
  readonly _core: {
    readonly _renderService: {
      readonly dimensions: {readonly css: {readonly cell: {readonly width: number; readonly height: number}}};
      readonly _renderer: {readonly value?: {readonly renderRows: (start: number, end: number) => void}};
    };
  };
}

/**
 * Resizes the grid to fill `host`, and paints the new grid in the same task.
 *
 * `terminal.resize` clears the canvas at once (setting a canvas's size wipes it) but queues the repaint for the next
 * animation frame. Called from a ResizeObserver, that frame is the one after the browser's next paint, so the
 * terminal shows blank for a frame on every step of a drag. Painting the rows here closes that gap. Returns false
 * when the host has no size or the renderer has not measured the font yet.
 */
export function fitTerminal(terminal: Terminal, host: HTMLElement): boolean {
  const {_renderService: render} = (terminal as unknown as Core)._core;
  const cell = render.dimensions.css.cell;
  if (cell.width === 0 || cell.height === 0) return false;
  const cols = Math.max(2, Math.floor((host.clientWidth - SCROLLBAR_WIDTH) / cell.width));
  const rows = Math.max(1, Math.floor(host.clientHeight / cell.height));
  if (cols === terminal.cols && rows === terminal.rows) return true;
  terminal.resize(cols, rows);
  render._renderer.value?.renderRows(0, rows - 1);
  return true;
}
