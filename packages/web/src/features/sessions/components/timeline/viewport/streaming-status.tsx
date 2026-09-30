import type {SessionSetupStep} from "@supernova/contracts/session-runtime/procedures";
import type {Ref} from "react";
import {Marker, MarkerContent} from "@/features/sessions/components/timeline/marker";
import MatrixLoader from "@/features/sessions/components/timeline/viewport/matrix-loader";
import {cn} from "@/lib/cn";

const SETUP_LABELS: Record<SessionSetupStep, string> = {worktree: "Creating worktree"};

interface StreamingStatusProps {
  readonly compacting: boolean;
  /** Setup running before the first turn; shown as a marker like compaction. */
  readonly setupStep?: SessionSetupStep | null;
  /** Tucks the status under the last message when that message ends with message spacing. */
  readonly pullIntoLastMessage: boolean;
  readonly ref: Ref<HTMLDivElement>;
}

/** Footer shown below the transcript while the agent works. */
export default function StreamingStatus(props: StreamingStatusProps) {
  const {compacting, pullIntoLastMessage, ref, setupStep = null} = props;
  const marker = setupStep ? SETUP_LABELS[setupStep] : compacting ? "Compacting context" : null;
  const label = marker ?? "Thinking";

  return (
    <div className={cn("relative z-10 mx-auto w-full max-w-3xl bg-surface px-5 pb-8 md:px-8", pullIntoLastMessage && "-mt-5")} data-timeline-footer="streaming-status" ref={ref}>
      {marker ? (
        <Marker role="status" variant="separator">
          <MarkerContent className="shimmer text-ink-faint">{label}</MarkerContent>
        </Marker>
      ) : (
        <p className="flex w-fit items-center gap-2.5 text-sm text-ink-faint" role="status">
          <MatrixLoader />
          <span className="shimmer">{label}</span>
        </p>
      )}
    </div>
  );
}
