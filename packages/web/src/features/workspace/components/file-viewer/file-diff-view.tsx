import {parseDiffFromFile} from "@pierre/diffs";
import {FileDiff, Virtualizer} from "@pierre/diffs/react";
import {useAppearanceStore} from "@/features/settings/stores/appearance-store";
import {generateDiffOptions} from "@/lib/diff/diff-viewer-options";

const VIRTUALIZER_CONFIG = {intersectionObserverMargin: 1200, overscrollSize: 600};

interface FileDiffViewProps {
  /** Show the whole file instead of collapsing unchanged regions. */
  readonly expanded: boolean;
  readonly newContents: string;
  readonly oldContents: string;
  readonly path: string;
  /** Side-by-side instead of the unified single column. */
  readonly split: boolean;
}

export default function FileDiffView(props: FileDiffViewProps) {
  const {expanded, newContents, oldContents, path, split} = props;
  const mode = useAppearanceStore((state) => state.resolvedMode);
  // Diffing both full sides lets Pierre reveal unchanged context on demand, which a patch alone cannot.
  const fileDiff = parseDiffFromFile({contents: oldContents, name: path}, {contents: newContents, name: path});

  return (
    <Virtualizer className="min-h-0 flex-1 select-text overflow-auto overscroll-contain" config={VIRTUALIZER_CONFIG} key={`${path}:${mode}:${expanded}:${split}`}>
      <FileDiff
        className="min-h-full"
        fileDiff={fileDiff}
        options={{...generateDiffOptions(mode), diffStyle: split ? "split" : "unified", expandUnchanged: expanded, hunkSeparators: "line-info", overflow: "scroll"}}
      />
    </Virtualizer>
  );
}
