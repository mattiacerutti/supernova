import type {PointerEvent} from "react";

/** `onDrag` receives the pointer x and its delta from pointer down. */
export function useDragResize(onDrag: (clientX: number, deltaX: number) => void): (event: PointerEvent<HTMLElement>) => void {
  return (event) => {
    event.preventDefault();

    const startX = event.clientX;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: globalThis.PointerEvent): void => {
      onDrag(moveEvent.clientX, moveEvent.clientX - startX);
    };

    const handlePointerUp = (): void => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, {once: true});
  };
}
