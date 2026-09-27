import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";

export default function SessionComposerSkeleton() {
  return (
    <div className="relative px-4 pb-7 md:px-6">
      <div className="mx-auto max-w-3xl rounded-3xl corner-superellipse/1.3 bg-surface-control px-3 py-2 ring-1 ring-border-muted shadow-md">
        <div className="min-h-10 p-1 text-sm font-light leading-5 text-ink-strong/25">Ask anything, @ to add files, or / for commands</div>

        <div className="flex items-center justify-between gap-2">
          <IconButton
            label="Attach files"
            className="grid size-8 place-items-center rounded-full text-ink-faint disabled:cursor-default disabled:hover:bg-transparent"
            disabled
            size="none"
            title="Attach files"
            variant="ghost"
          >
            <Icon name="plus" size="sm" />
          </IconButton>

          <div className="flex min-w-0 items-center gap-4">
            <div className="flex gap-2" aria-hidden="true">
              <span className="h-5 w-28 animate-pulse rounded-xl corner-superellipse/1.3 bg-overlay-pressed" />
              <span className="h-5 w-20 animate-pulse rounded-xl corner-superellipse/1.3 bg-overlay-pressed" />
            </div>
            <IconButton
              label="Send message"
              className="grid size-9 place-items-center rounded-full bg-overlay-pressed text-ink-muted disabled:cursor-default disabled:bg-overlay-pressed disabled:text-ink-muted"
              disabled
              size="none"
              variant="bare"
            >
              <Icon name="send" size="md" />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
