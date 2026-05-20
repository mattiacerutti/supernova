import {FileDiff} from "@pierre/diffs";
import type {FileDiffMetadata, FileDiffOptions} from "@pierre/diffs";
import {useRef} from "react";
import {generateDiffOptions} from "@/features/sessions/lib/diff/diff-viewer-options";
import {cn} from "@/lib/cn";
import {useMountEffect} from "@/lib/use-mount-effect";

interface DiffViewerProps {
  readonly className?: string;
  readonly fileDiff: FileDiffMetadata;
  readonly options?: FileDiffOptions<unknown>;
}

export default function DiffViewer(props: DiffViewerProps) {
  const {className, fileDiff, options} = props;
  const wrapperRef = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    if (wrapperRef.current === null) return;

    const renderer = new FileDiff<unknown>({...generateDiffOptions<unknown>(), ...options});
    renderer.render({containerWrapper: wrapperRef.current, fileDiff});

    return () => {
      renderer.cleanUp();
    };
  });

  return <div className={cn("min-w-0 [&>diffs-container]:block [&>diffs-container]:min-w-0", className)} ref={wrapperRef} />;
}
