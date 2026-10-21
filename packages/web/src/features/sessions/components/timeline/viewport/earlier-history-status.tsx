import Button from "@/components/ui/button";

/** Pauses the shimmer while the status is out of view: it stays mounted far above the viewport, and an endless shimmer there repaints every frame. */
function pauseShimmerOffscreen(element: HTMLElement | null): (() => void) | undefined {
  if (!element) return;
  const observer = new IntersectionObserver(([entry]) => {
    element.dataset.offscreen = String(!entry?.isIntersecting);
  });
  observer.observe(element);
  return () => observer.disconnect();
}

interface EarlierHistoryStatusProps {
  readonly failed: boolean;
  readonly height: number;
  readonly onRetry: () => void;
  readonly top: number;
}

/** Not a virtual row: it lives in the canvas's top padding so TanStack anchors a prepend to the turns themselves. */
export default function EarlierHistoryStatus(props: EarlierHistoryStatusProps) {
  const {failed, height, onRetry, top} = props;

  return (
    <div className="absolute inset-x-0 mx-auto flex w-full max-w-3xl items-center justify-center px-5 md:px-8" data-timeline-earlier-history style={{height, top}}>
      {failed ? (
        <p className="flex items-center gap-2 text-sm text-ink-faint" role="alert">
          Unable to load earlier messages.
          <Button className="text-ink-muted underline-offset-2 hover:underline" onClick={onRetry} variant="ghost">
            Retry
          </Button>
        </p>
      ) : (
        <p className="shimmer text-sm text-ink-faint data-[offscreen=true]:[animation-play-state:paused]" ref={pauseShimmerOffscreen} role="status">
          Loading earlier messages
        </p>
      )}
    </div>
  );
}
