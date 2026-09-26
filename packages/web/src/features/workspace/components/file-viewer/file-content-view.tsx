import {File, Virtualizer} from "@pierre/diffs/react";
import {useSettingsStore} from "@/stores/settings-store";
import {generateFileOptions} from "@/lib/diffs/options";

const VIRTUALIZER_CONFIG = {intersectionObserverMargin: 1200, overscrollSize: 600};

interface FileContentViewProps {
  readonly content: string;
  readonly path: string;
}

export default function FileContentView(props: FileContentViewProps) {
  const {content, path} = props;
  const mode = useSettingsStore((state) => state.resolvedMode);

  return (
    <Virtualizer className="min-h-0 flex-1 select-text overflow-auto overscroll-contain" config={VIRTUALIZER_CONFIG} key={`${path}:${mode}`}>
      <File className="min-h-full" file={{contents: content, name: path}} options={generateFileOptions(mode)} />
    </Virtualizer>
  );
}
