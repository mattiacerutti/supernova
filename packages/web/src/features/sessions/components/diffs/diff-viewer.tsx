import {FileDiff} from "@pierre/diffs";
import type {FileDiffMetadata, FileDiffOptions} from "@pierre/diffs";
import {useRef} from "react";
import {generateDiffOptions} from "@/features/sessions/lib/diff/diff-viewer-options";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import type {ResolvedAppearanceMode} from "@/features/settings/stores/appearance-store";
import {cn} from "@/lib/cn";
import {useMountEffect} from "@/lib/use-mount-effect";

interface DiffViewerContentProps {
  readonly className?: string;
  readonly fileDiff: FileDiffMetadata;
  readonly mode: ResolvedAppearanceMode;
  readonly options?: FileDiffOptions<unknown>;
}

function DiffViewerContent(props: DiffViewerContentProps) {
  const {className, fileDiff, mode, options} = props;
  const wrapperRef = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    if (wrapperRef.current === null) return;

    const renderer = new FileDiff<unknown>({...generateDiffOptions<unknown>(mode), ...options});
    renderer.render({containerWrapper: wrapperRef.current, fileDiff});

    return () => {
      renderer.cleanUp();
    };
  });

  return <div className={cn("min-w-0 [&>diffs-container]:block [&>diffs-container]:min-w-0", className)} ref={wrapperRef} />;
}

interface DiffViewerProps {
  readonly className?: string;
  readonly fileDiff: FileDiffMetadata;
  readonly options?: FileDiffOptions<unknown>;
}

export default function DiffViewer(props: DiffViewerProps) {
  const mode = useAppearanceStore((state) => state.resolvedMode);

  return <DiffViewerContent {...props} key={mode} mode={mode} />;
}
