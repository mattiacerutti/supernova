import type {Terminal as GhosttyTerminal} from "ghostty-web";

interface CursorRenderer {
  cursorVisible: boolean;
  ctx: CanvasRenderingContext2D;
  metrics: {readonly height: number; readonly width: number};
  renderCursor: (x: number, y: number) => void;
  startCursorBlink: () => void;
  stopCursorBlink: () => void;
  theme: {readonly cursor: string};
}

/**
 * Makes the cursor show whether the terminal has keyboard focus, as native terminals do: a filled, blinking block
 * while focused and a steady hollow outline while not. ghostty-web draws the same filled block either way, so the
 * renderer's cursor method is wrapped per instance.
 */
export function attachFocusCursor(terminal: GhosttyTerminal, host: HTMLElement): () => void {
  const renderer = terminal.renderer as unknown as CursorRenderer | undefined;
  if (!renderer) return () => undefined;
  const renderFilled = renderer.renderCursor.bind(renderer);
  let focused = host.contains(document.activeElement);

  renderer.renderCursor = (x, y) => {
    if (focused) {
      renderFilled(x, y);
      return;
    }
    const {ctx, metrics} = renderer;
    ctx.strokeStyle = renderer.theme.cursor;
    ctx.lineWidth = 1;
    ctx.strokeRect(x * metrics.width + 0.5, y * metrics.height + 0.5, metrics.width - 1, metrics.height - 1);
  };

  const applyFocus = (next: boolean): void => {
    if (next === focused) return;
    focused = next;
    // The unfocused outline never blinks; blinking resumes, cursor shown, when focus returns. `stopCursorBlink` also
    // clears the interval, and `startCursorBlink` does not, so stop first to never stack two.
    renderer.stopCursorBlink();
    if (focused) renderer.startCursorBlink();
    renderer.cursorVisible = true;
  };
  const handleFocusIn = (): void => applyFocus(true);
  const handleFocusOut = (event: FocusEvent): void => {
    if (!host.contains(event.relatedTarget as Node | null)) applyFocus(false);
  };
  host.addEventListener("focusin", handleFocusIn);
  host.addEventListener("focusout", handleFocusOut);
  if (!focused) renderer.stopCursorBlink();

  return () => {
    host.removeEventListener("focusin", handleFocusIn);
    host.removeEventListener("focusout", handleFocusOut);
  };
}
