import Button from "@/components/ui/button";

interface EarlierHistoryStatusProps {
  readonly failed: boolean;
  readonly height: number;
  readonly onRetry: () => void;
  readonly top: number;
}

/**
 * Sits above the first loaded turn while earlier ones exist. It is not a virtual row: it lives in the canvas's top
 * padding, so TanStack anchors a prepend to the turns themselves.
 */
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
        <p className="shimmer text-sm text-ink-faint" role="status">
          Loading earlier messages
        </p>
      )}
    </div>
  );
}
