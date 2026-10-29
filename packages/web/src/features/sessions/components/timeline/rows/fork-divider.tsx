import Icon from "@/components/ui/icon";
import {Marker, MarkerContent} from "@/features/sessions/components/timeline/marker";

const LABEL = "Forked from an earlier session";

/** Separates a fork's copied history from its own turns. */
export default function ForkDivider() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-8 md:px-8">
      <Marker aria-label={LABEL} className="text-ink-faint" role="separator" variant="separator">
        <MarkerContent aria-hidden="true" className="flex items-center gap-1.5">
          <Icon className="shrink-0" name="git-branch" size="xs" />
          {LABEL}
        </MarkerContent>
      </Marker>
    </div>
  );
}
