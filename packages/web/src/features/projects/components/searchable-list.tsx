import type {CSSProperties, KeyboardEvent, ReactNode, Ref} from "react";
import {useRef, useState} from "react";
import {useVirtualizer} from "@tanstack/react-virtual";
import {cn} from "@/lib/cn";

interface SearchableListInputProps {
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

interface SearchableListItemRenderProps {
  highlighted: boolean;
  ref: Ref<HTMLDivElement>;
  select: () => void;
}

interface SearchableListBaseProps<TItem> {
  activeIndex: number;
  className?: string;
  getItemKey: (item: TItem, index: number) => string;
  isItemSelectable?: (item: TItem, index: number) => boolean;
  items: TItem[];
  listStatus?: ReactNode;
  onActiveIndexChange: (updater: number | ((current: number) => number)) => void;
  onSelect?: (item: TItem) => void;
  onSubmit?: (item: TItem | undefined) => void;
  onTab?: (item: TItem) => void;
  renderInput: (props: SearchableListInputProps) => ReactNode;
  renderItem: (item: TItem, index: number, renderProps: SearchableListItemRenderProps) => ReactNode;
}

interface StaticSearchableListProps<TItem> extends SearchableListBaseProps<TItem> {
  estimateSize?: never;
  virtualized?: false;
}

interface VirtualizedSearchableListProps<TItem> extends SearchableListBaseProps<TItem> {
  estimateSize: (index: number) => number;
  virtualized: true;
}

type SearchableListProps<TItem> = StaticSearchableListProps<TItem> | VirtualizedSearchableListProps<TItem>;

/** Renders a keyboard and pointer navigable searchable list for command-style dialogs. */
export default function SearchableList<TItem>(props: SearchableListProps<TItem>) {
  const {activeIndex, className, getItemKey, isItemSelectable = () => true, items, listStatus, onActiveIndexChange, onSelect, onSubmit, onTab, renderInput, renderItem} = props;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectionSource, setSelectionSource] = useState<"keyboard" | "mouse">("keyboard");
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const virtualized = props.virtualized === true;
  const selectableIndexes = items.map((item, index) => (isItemSelectable(item, index) ? index : -1)).filter((index) => index >= 0);
  const selectedActiveIndex = Math.min(activeIndex, items.length - 1);
  const highlightedIndex = selectableIndexes.find((index) => index >= selectedActiveIndex) ?? selectableIndexes.at(0) ?? -1;
  const visibleHighlightIndex = hoveredIndex ?? highlightedIndex;
  const activeItem = highlightedIndex >= 0 ? items[highlightedIndex] : undefined;

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: virtualized ? items.length : 0,
    estimateSize: virtualized ? props.estimateSize : () => 1,
    getScrollElement: () => scrollParentRef.current,
    getItemKey: (index) => getItemKey(items[index]!, index),
    overscan: 8,
  });

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && selectableIndexes.length > 0) {
      event.preventDefault();
      setHoveredIndex(null);
      setSelectionSource("keyboard");
      onActiveIndexChange((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const selectedIndex = selectableIndexes.includes(current) ? current : highlightedIndex;
        const selectableIndex = selectableIndexes.indexOf(selectedIndex);
        const nextSelectableIndex = (selectableIndex + delta + selectableIndexes.length) % selectableIndexes.length;
        const nextIndex = selectableIndexes[nextSelectableIndex] ?? selectableIndexes[0]!;
        if (virtualized) virtualizer.scrollToIndex(nextIndex, {align: "center"});
        return nextIndex;
      });
      return;
    }

    if (event.key === "Enter" && (activeItem || onSubmit)) {
      event.preventDefault();
      if (onSubmit) {
        onSubmit(activeItem);
        return;
      }
      if (activeItem) onSelect?.(activeItem);
      return;
    }

    if (event.key === "Tab" && activeItem && onTab) {
      event.preventDefault();
      onTab(activeItem);
    }
  };

  const renderItemAtIndex = (index: number, style?: CSSProperties, measureElement?: (element: HTMLDivElement | null) => void): ReactNode => {
    const item = items[index];
    if (!item) return null;

    const selectable = isItemSelectable(item, index);

    const handlePointerHover = (): void => {
      if (!selectable) return;
      setHoveredIndex(index);
      setSelectionSource("mouse");
      onActiveIndexChange(index);
    };

    const itemRef: Ref<HTMLDivElement> = (element) => {
      if (!virtualized && selectionSource === "keyboard" && hoveredIndex === null && index === highlightedIndex && element) {
        element.scrollIntoView({block: "center"});
      }
    };

    const handleSelect = (): void => {
      if (selectable) onSelect?.(item);
    };

    return (
      <div data-index={index} key={getItemKey(item, index)} ref={measureElement} style={style}>
        <div onMouseLeave={() => setHoveredIndex(null)} onPointerMove={handlePointerHover}>
          {renderItem(item, index, {highlighted: index === visibleHighlightIndex, ref: itemRef, select: handleSelect})}
        </div>
      </div>
    );
  };

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <>
      {renderInput({onKeyDown: handleKeyDown})}
      <div className={cn("-ml-3 -mr-5 min-h-0 flex-1 overflow-y-auto pb-2 pr-2", className)} ref={scrollParentRef}>
        {listStatus}
        {virtualized && (
          <div className="relative w-full" style={{height: `${virtualizer.getTotalSize()}px`}}>
            {virtualItems.map((virtualItem) =>
              renderItemAtIndex(
                virtualItem.index,
                {left: 0, position: "absolute", top: 0, transform: `translateY(${virtualItem.start}px)`, width: "100%"},
                virtualizer.measureElement
              )
            )}
          </div>
        )}
        {!virtualized && items.map((_, index) => renderItemAtIndex(index))}
      </div>
    </>
  );
}
