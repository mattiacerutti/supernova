import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";

export default function SessionComposerSkeleton() {
  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="mx-auto max-w-3xl rounded-3xl corner-superellipse/1.3 bg-[#2b2b2b] px-3 py-2 ring-1 ring-white/6 shadow-md">
        <textarea
          className="max-h-48 min-h-10 w-full resize-none overflow-y-auto bg-transparent p-1 text-sm text-neutral-200 outline-none field-sizing-content placeholder:text-md placeholder:font-light placeholder:text-white/25 disabled:cursor-default"
          disabled
          placeholder="Ask for follow-up changes"
          rows={1}
          value=""
          readOnly
        />

        <div className="flex items-center justify-between gap-2">
          <IconButton
            label="Attach files"
            className="grid size-8 place-items-center rounded-full text-neutral-600 disabled:cursor-default disabled:hover:bg-transparent"
            disabled
            size="none"
            title="Attach files"
            variant="ghost"
          >
            <Icon name="plus" size="sm" />
          </IconButton>

          <div className="flex min-w-0 items-center gap-4">
            <div className="flex gap-2" aria-hidden="true">
              <span className="h-5 w-28 animate-pulse rounded-xl corner-superellipse/1.3 bg-white/10" />
              <span className="h-5 w-20 animate-pulse rounded-xl corner-superellipse/1.3 bg-white/10" />
            </div>
            <IconButton
              label="Send message"
              className="grid size-9 place-items-center rounded-full bg-white/10 text-neutral-500 disabled:cursor-default disabled:bg-white/10 disabled:text-neutral-500"
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
