import type {Terminal} from "@xterm/xterm";

/** xterm's vertical scrollbar width when `overviewRuler.width` is not set (`ViewportConstants.DEFAULT_SCROLL_BAR_WIDTH`). */
const SCROLLBAR_WIDTH = 14;

/** Private xterm.js 6.0.0 surface; `@xterm/addon-fit` reads the same `_core._renderService`, so this is no more fragile. */
interface Core {
  readonly _core: {
    readonly _renderService: {
      readonly dimensions: {readonly css: {readonly cell: {readonly width: number; readonly height: number}}};
      readonly _renderer: {readonly value?: {readonly renderRows: (start: number, end: number) => void}};
    };
  };
}

/** `terminal.resize` clears the canvas now but repaints next frame; painting the rows here closes that blank frame. */
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
