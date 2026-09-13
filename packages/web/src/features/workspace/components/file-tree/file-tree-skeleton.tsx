import {FILE_TREE_ROW_HEIGHT_PX, FILE_TREE_ROW_INDENT_PX} from "@/features/workspace/components/file-tree/file-tree-row";

/** [depth, label width class] for a plausible little tree: two folders with children, then loose files. */
const ROWS: readonly (readonly [depth: number, width: string])[] = [
  [0, "w-16"],
  [1, "w-24"],
  [1, "w-20"],
  [0, "w-14"],
  [1, "w-28"],
  [1, "w-16"],
  [0, "w-24"],
  [0, "w-20"],
];

export default function FileTreeSkeleton() {
  return (
    <div aria-label="Loading files" className="animate-pulse px-1.5" role="status">
      {ROWS.map(([depth, width], index) => (
        <div className="flex items-center gap-1.5 pr-3" key={index} style={{height: `${FILE_TREE_ROW_HEIGHT_PX}px`, paddingLeft: `${6 + depth * FILE_TREE_ROW_INDENT_PX}px`}}>
          <span className="w-3 shrink-0" />
          <span className="size-3.5 shrink-0 rounded-sm bg-overlay-pressed" />
          <span className={`h-3 rounded-full bg-overlay-pressed ${width}`} />
        </div>
      ))}
    </div>
  );
}
