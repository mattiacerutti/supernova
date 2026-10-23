import Icon from "@/components/ui/icon";
import {Marker, MarkerContent} from "@/features/sessions/components/timeline/marker";

/** Separates a fork's copied history from its own turns. */
export default function ForkDivider() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 pb-8 md:px-8" data-timeline-row="fork-divider">
      <Marker className="text-ink-faint" variant="separator">
        <MarkerContent className="flex items-center gap-1.5">
          <Icon aria-hidden="true" className="shrink-0" name="git-branch" size="xs" />
          Forked from an earlier session
        </MarkerContent>
      </Marker>
    </div>
  );
}
