import {FileDiff, Virtualizer} from "@pierre/diffs/react";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import {generateDiffOptions} from "@/lib/diff/diff-viewer-options";
import {parseFilePatch} from "@/lib/diff/parse-file-patch";

const VIRTUALIZER_CONFIG = {intersectionObserverMargin: 1200, overscrollSize: 600};

interface FileDiffViewProps {
  readonly patch: string;
  readonly path: string;
}

export default function FileDiffView(props: FileDiffViewProps) {
  const {patch, path} = props;
  const mode = useAppearanceStore((state) => state.resolvedMode);
  const fileDiff = parseFilePatch({patch, path});

  if (!fileDiff) return null;

  return (
    <Virtualizer className="min-h-0 flex-1 overflow-auto overscroll-contain" config={VIRTUALIZER_CONFIG} key={`${path}:${mode}`}>
      <FileDiff className="min-h-full" fileDiff={fileDiff} options={{...generateDiffOptions(mode), overflow: "scroll"}} />
    </Virtualizer>
  );
}
