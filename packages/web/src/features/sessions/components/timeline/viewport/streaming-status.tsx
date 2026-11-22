import type {SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import type {Ref} from "react";
import ShimmerText from "@/components/ui/shimmer-text";
import {Marker, MarkerContent} from "@/features/sessions/components/timeline/marker";
import MatrixLoader from "@/features/sessions/components/timeline/viewport/matrix-loader";

const SETUP_LABELS: Record<SessionSetupStep, string> = {worktree: "Creating worktree"};

interface StreamingStatusProps {
  readonly compacting: boolean;
  readonly setupStep?: SessionSetupStep | null;
  readonly ref: Ref<HTMLDivElement>;
}

export default function StreamingStatus(props: StreamingStatusProps) {
  const {compacting, ref, setupStep = null} = props;
  const marker = setupStep ? SETUP_LABELS[setupStep] : compacting ? "Compacting context" : null;
  const label = marker ?? "Thinking";

  return (
    <div className="relative z-10 mx-auto w-full max-w-conversation bg-surface px-5 pb-8 md:px-8" data-timeline-footer="streaming-status" ref={ref}>
      {marker ? (
        <Marker role="status" variant="separator">
          <MarkerContent className="text-ink-faint">
            <ShimmerText>{label}</ShimmerText>
          </MarkerContent>
        </Marker>
      ) : (
        <p className="flex w-fit items-center gap-2.5 text-sm text-ink-faint" role="status">
          <MatrixLoader />
          <ShimmerText>{label}</ShimmerText>
        </p>
      )}
    </div>
  );
}
