import {CodeView} from "@pierre/diffs";
import type {FileDiffMetadata} from "@pierre/diffs";
import {useRef} from "react";
import {generateDiffOptions, getDiffLineHeight} from "@/lib/diffs/options";
import {getHighlightWorkerPool} from "@/lib/highlighter/worker-pool";
import {useSettingsStore} from "@/stores/settings-store";
import type {ResolvedAppearanceMode} from "@/stores/settings-store";
import {useMountEffect} from "@/hooks/use-mount-effect";

interface DiffViewerContentProps {
  readonly fileDiff: FileDiffMetadata;
  readonly mode: ResolvedAppearanceMode;
  readonly lineHeight: number;
}

function DiffViewerContent(props: DiffViewerContentProps) {
  const {fileDiff, lineHeight, mode} = props;
  const wrapperRef = useRef<HTMLDivElement>(null);

  useMountEffect(() => {
    let disposed = false;
    let renderer: CodeView | undefined;
    // Plain-text diffs have no highlight task to retry a render before the pool is ready.
    void getHighlightWorkerPool(mode).then((workerPool) => {
      if (disposed || wrapperRef.current === null) return;
      renderer = new CodeView(
        {
          ...generateDiffOptions(mode),
          itemMetrics: {lineHeight, spacing: 0, hunkSeparatorHeight: 0, diffHeaderHeight: 0},
          layout: {paddingTop: 0, paddingBottom: 0, gap: 0},
        },
        workerPool
      );
      renderer.setup(wrapperRef.current);
      renderer.setItems([{id: fileDiff.name, type: "diff", fileDiff}]);
    });

    return () => {
      disposed = true;
      renderer?.cleanUp();
    };
  });

  return <div className="scroll-fade min-w-0 max-h-72 overflow-auto overscroll-contain" data-scrollable ref={wrapperRef} />;
}

interface DiffViewerProps {
  readonly fileDiff: FileDiffMetadata;
}

export default function DiffViewer(props: DiffViewerProps) {
  const mode = useSettingsStore((state) => state.resolvedMode);
  const lineHeight = useSettingsStore((state) => getDiffLineHeight(state.fontSizes.code, state.fontSizes.interface));

  return <DiffViewerContent {...props} key={`${mode}:${lineHeight}`} lineHeight={lineHeight} mode={mode} />;
}
