import type {UseQueryResult} from "@tanstack/react-query";
import type {KeyboardEvent, ReactNode} from "react";
import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {ComposerSuggestionItem} from "@/features/sessions/types/composer-suggestion";
import {cn} from "@/lib/cn";

interface ComposerSuggestionMenuProps {
  readonly children: ReactNode;
  readonly onSelect: (item: ComposerSuggestionItem) => void;
  readonly onSubmit: () => void;
  readonly open: boolean;
  readonly query: UseQueryResult<readonly ComposerSuggestionItem[]>;
}

interface ComposerSuggestionItemRowProps {
  readonly highlighted: boolean;
  readonly item: ComposerSuggestionItem;
  readonly onHoverEnd: () => void;
  readonly onPointerHover: () => void;
  readonly onSelect: () => void;
  readonly shouldScrollIntoView: boolean;
}

interface ComposerSuggestionSection {
  readonly items: readonly (ComposerSuggestionItem & {readonly index: number})[];
  readonly title: string;
}

function suggestionSections(items: readonly ComposerSuggestionItem[]): readonly ComposerSuggestionSection[] {
  const indexedItems = items.map((item, index) => ({...item, index}));

  return [
    {items: indexedItems.filter((item) => item.kind === "file"), title: "Files"},
    {items: indexedItems.filter((item) => item.kind === "skill"), title: "Skills"},
    {items: indexedItems.filter((item) => item.kind === "prompt-template"), title: "Prompts"},
    {items: indexedItems.filter((item) => item.kind === "slash-command"), title: "Commands"},
  ].filter((section) => section.items.length > 0);
}

function SuggestionIcon(props: {readonly item: ComposerSuggestionItem}) {
  const {item} = props;

  if (item.kind === "file") return <Icon className="shrink-0 text-neutral-500" name={item.path.endsWith("/") ? "folder" : "file"} size="xs" />;
  if (item.kind === "skill") return <Icon className="shrink-0 text-neutral-500" name="skill" size="xs" />;

  return <span className="w-3 shrink-0 text-center text-xs font-medium text-neutral-500">{item.kind.slice(0, 1).toUpperCase()}</span>;
}

function ComposerSuggestionItemRow(props: ComposerSuggestionItemRowProps) {
  const {highlighted, item, onHoverEnd, onPointerHover, onSelect, shouldScrollIntoView} = props;
  const detail = item.subtitle;

  return (
    <div
      className={cn("group flex items-center gap-1 rounded-xl corner-superellipse/1.3", highlighted && "bg-white/6")}
      onMouseLeave={onHoverEnd}
      onPointerMove={onPointerHover}
      ref={(element) => {
        if (shouldScrollIntoView && element) {
          element.scrollIntoView({block: "center"});
        }
      }}
    >
      <Button
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-3 py-1.5 text-left"
        onClick={onSelect}
        onPointerDown={(event) => event.preventDefault()}
        variant="bare"
      >
        <SuggestionIcon item={item} />
        <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
          <span className="shrink-0 font-medium text-neutral-300">{item.title}</span>
          {detail && <span className="min-w-0 flex-1 truncate text-neutral-500">{detail}</span>}
        </span>
      </Button>
    </div>
  );
}

export default function ComposerSuggestionMenu(props: ComposerSuggestionMenuProps) {
  const {children, onSelect, onSubmit, open, query} = props;
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [hoveredSuggestionIndex, setHoveredSuggestionIndex] = useState<number | null>(null);
  const [selectionSource, setSelectionSource] = useState<"keyboard" | "mouse">("keyboard");
  const items = query.data ?? [];
  const sections = suggestionSections(items);
  const showLoadingPanel = open && query.isLoading;
  const showSettledPanel = open && !query.isLoading && (query.isError || items.length > 0 || query.isSuccess);
  const highlightedIndex = items.length === 0 ? -1 : Math.min(activeSuggestionIndex, items.length - 1);
  const activeSuggestion = highlightedIndex >= 0 ? items[highlightedIndex] : undefined;
  const visibleHighlightIndex = hoveredSuggestionIndex ?? highlightedIndex;

  const handleSuggestionHoverStart = (index: number): void => {
    setHoveredSuggestionIndex(index);
    setSelectionSource("mouse");
    setActiveSuggestionIndex(index);
  };

  const handleKeyDownCapture = (event: KeyboardEvent<HTMLElement>): void => {
    if (open && items.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      event.stopPropagation();
      setHoveredSuggestionIndex(null);
      setSelectionSource("keyboard");
      setActiveSuggestionIndex((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const selectedIndex = Math.max(0, Math.min(current, items.length - 1));
        return (selectedIndex + delta + items.length) % items.length;
      });
      return;
    }

    if (open && activeSuggestion && (event.key === "Tab" || event.key === "Enter")) {
      event.preventDefault();
      event.stopPropagation();
      onSelect(activeSuggestion);
      return;
    }

    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    event.stopPropagation();
    onSubmit();
  };

  return (
    <div className="relative" onKeyDownCapture={handleKeyDownCapture}>
      {showLoadingPanel && (
        <div className="absolute -inset-x-3 bottom-full z-40 mb-4 opacity-100 delay-200 starting:opacity-0">
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-800/95 p-1 text-neutral-200 backdrop-blur-3xl">
            <p className="px-3 py-2 text-sm text-neutral-600">Loading suggestions...</p>
          </div>
        </div>
      )}
      {showSettledPanel && (
        <div className="absolute -inset-x-3 bottom-full z-40 mb-4">
          <div className="max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-neutral-800/95 p-1 text-neutral-200 backdrop-blur-3xl">
            {query.isError && <p className="px-3 py-2 text-sm text-red-400">{query.error instanceof Error ? query.error.message : "Unable to load suggestions."}</p>}
            {!query.isError && items.length === 0 && <p className="px-3 py-2 text-sm text-neutral-600">No items</p>}

            {!query.isError &&
              sections.map((section) => (
                <div className="pb-1" key={section.title}>
                  <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">{section.title}</p>
                  {section.items.map((item) => (
                    <ComposerSuggestionItemRow
                      highlighted={item.index === visibleHighlightIndex}
                      item={item}
                      key={`${item.kind}-${item.id}`}
                      onHoverEnd={() => setHoveredSuggestionIndex(null)}
                      onPointerHover={() => handleSuggestionHoverStart(item.index)}
                      onSelect={() => onSelect(item)}
                      shouldScrollIntoView={selectionSource === "keyboard" && hoveredSuggestionIndex === null && item.index === highlightedIndex}
                    />
                  ))}
                </div>
              ))}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
