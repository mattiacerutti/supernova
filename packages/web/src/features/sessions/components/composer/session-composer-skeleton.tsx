import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import SessionComposerShell from "@/features/sessions/components/composer/session-composer-shell";

export default function SessionComposerSkeleton() {
  return (
    <SessionComposerShell
      attachmentDisabled
      controls={
        <div className="flex gap-2" aria-hidden="true">
          <span className="h-7 w-28 animate-pulse rounded-full bg-white/10" />
          <span className="h-7 w-20 animate-pulse rounded-full bg-white/10" />
        </div>
      }
      primaryAction={
        <IconButton
          label="Send message"
          className="grid size-9 place-items-center rounded-full bg-white/10 text-neutral-500 disabled:cursor-default disabled:bg-white/10 disabled:text-neutral-500"
          disabled
          size="none"
          variant="bare"
        >
          <Icon name="send" size="md" />
        </IconButton>
      }
    >
      <textarea
        className="max-h-48 min-h-10 w-full resize-none overflow-y-auto bg-transparent p-1 text-sm text-neutral-200 outline-none field-sizing-content placeholder:text-md placeholder:font-light placeholder:text-white/25 disabled:cursor-default"
        disabled
        placeholder="Ask for follow-up changes"
        rows={1}
        value=""
        readOnly
      />
    </SessionComposerShell>
  );
}
