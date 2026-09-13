import type {PointerEvent} from "react";

/**
 * `onDrag` receives the pointer x and its delta from pointer down. The document carries
 * `data-resizing` during the drag so every panel drops its width transition, since one
 * panel's drag can resize another through the layout clamps.
 */
export function useDragResize(onDrag: (clientX: number, deltaX: number) => void): (event: PointerEvent<HTMLElement>) => void {
  return (event) => {
    event.preventDefault();

    const startX = event.clientX;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.documentElement.dataset.resizing = "";

    const handlePointerMove = (moveEvent: globalThis.PointerEvent): void => {
      onDrag(moveEvent.clientX, moveEvent.clientX - startX);
    };

    const handlePointerUp = (): void => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      delete document.documentElement.dataset.resizing;
      window.removeEventListener("pointermove", handlePointerMove);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, {once: true});
  };
}
