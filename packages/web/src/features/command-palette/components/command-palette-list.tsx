import type {KeyboardEvent, ReactNode} from "react";
import {useState} from "react";
import SearchableList from "@/components/searchable-list";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Kbd from "@/components/ui/kbd";
import {MenuLabel} from "@/components/ui/menu";
import SearchField from "@/components/ui/search-field";
import type {CommandPaletteItemState} from "@/features/command-palette/components/command-palette-item";
import type {CommandPaletteHeaderRow, CommandPaletteHint} from "@/features/command-palette/types/command-palette";

const HEADER_ROW_HEIGHT = 28;
const ITEM_ROW_HEIGHT = 40;

function isHeaderRow(row: object): row is CommandPaletteHeaderRow {
  return "type" in row && row.type === "header";
}

interface CommandPaletteInputProps {
  readonly onBack: (() => void) | undefined;
  readonly onChange: (value: string) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  readonly placeholder: string;
  readonly trailing: ReactNode;
  readonly value: string;
}

/** The search row. A nested page gets a back button, and Backspace in its empty input goes back. */
function CommandPaletteInput(props: CommandPaletteInputProps) {
  const {onBack, onChange, onKeyDown, placeholder, trailing, value} = props;

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // A held Backspace that just cleared the query should not keep going and leave the page.
    if (onBack && event.key === "Backspace" && value.length === 0 && !event.repeat) {
      event.preventDefault();
      onBack();
      return;
    }

    onKeyDown(event);
  };

  return (
    // Every page's search row is the same height with its text at the same position: the leading slot is one fixed
    // box whether it holds the search icon or the back button, and trailing controls must fit `size-6`.
    <SearchField
      aria-label={placeholder}
      autoFocus
      className="-mx-5 h-12 px-5 py-0"
      leading={
        <span className="-ml-1 grid size-6 shrink-0 place-items-center">
          {onBack ? (
            <IconButton className="size-6" label="Back" onClick={onBack}>
              <Icon name="arrow-left" size="sm" />
            </IconButton>
          ) : (
            <Icon name="search" size="sm" />
          )}
        </span>
      }
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      trailing={trailing}
      value={value}
    />
  );
}

interface CommandPaletteFooterProps {
  readonly canGoBack: boolean;
  readonly hints: readonly CommandPaletteHint[];
}

/** The key hint bar. Navigation and close are always listed; the page adds what its keys do. */
function CommandPaletteFooter(props: CommandPaletteFooterProps) {
  const {canGoBack, hints} = props;
  const allHints: readonly CommandPaletteHint[] = [
    {hotkeys: ["ArrowUp", "ArrowDown"], label: "Navigate"},
    ...hints,
    ...(canGoBack ? [{hotkeys: ["Backspace"], label: "Back"} satisfies CommandPaletteHint] : []),
    {hotkeys: ["Escape"], label: "Close"},
  ];

  return (
    <div className="-mx-5 flex shrink-0 items-center gap-4 border-t border-border-muted px-5 py-2.5 text-xs text-ink-faint">
      {allHints.map((hint) => (
        <span className="flex items-center gap-1.5" key={hint.label}>
          <Kbd hotkeys={hint.hotkeys} />
          <span>{hint.label}</span>
        </span>
      ))}
    </div>
  );
}

interface CommandPaletteListProps<TRow extends object> {
  readonly getRowKey: (row: TRow) => string;
  /** The page's own keys, shown between navigation and back/close, such as Enter and Tab. */
  readonly hints: readonly CommandPaletteHint[];
  /** A control after the input, such as a submit button; it must fit `size-6` so the row keeps its height. */
  readonly inputTrailing?: ReactNode;
  /** Shown on nested pages: adds the back button, Backspace to go back, and its hint. */
  readonly onBack?: () => void;
  /** Called when the list is scrolled near its end, to load the next page of a paged list. */
  readonly onEndReached?: () => void;
  /** Called when a row is highlighted by keyboard or pointer, for example to load what selecting it will need. */
  readonly onHighlight?: (row: TRow) => void;
  readonly onQueryChange: (query: string) => void;
  /** Called when a row is clicked, and on Enter unless `onSubmit` is set. */
  readonly onSelect: (row: TRow) => void;
  /** Replaces what Enter does, for pages whose input is a value to submit rather than a filter. */
  readonly onSubmit?: () => void;
  /** Called on Tab with the highlighted row, for pages that complete the input from a row. */
  readonly onTab?: (row: TRow) => void;
  readonly placeholder: string;
  readonly query: string;
  readonly renderRow: (row: TRow, itemState: CommandPaletteItemState) => ReactNode;
  /** The rows for the current query, with `CommandPaletteHeaderRow`s between sections. */
  readonly rows: readonly (CommandPaletteHeaderRow | TRow)[];
  /** Shown above the rows, for an empty, loading, or error state. */
  readonly status?: ReactNode;
}

/**
 * A palette page: the search row, the keyboard-navigable rows, and the key hint footer. The page owns the query and
 * the rows it produces; the highlight returns to the first row whenever the query changes.
 */
export default function CommandPaletteList<TRow extends object>(props: CommandPaletteListProps<TRow>) {
  const {getRowKey, hints, inputTrailing, onBack, onEndReached, onHighlight, onQueryChange, onSelect, onSubmit, onTab, placeholder, query, renderRow, rows, status} = props;
  // The highlight is remembered with the query it was set for, so a new query starts from the first row again.
  const [highlight, setHighlight] = useState({index: 0, query});
  const activeIndex = highlight.query === query ? highlight.index : 0;

  const handleActiveIndexChange = (updater: number | ((current: number) => number)): void => {
    const index = typeof updater === "function" ? updater(activeIndex) : updater;
    setHighlight({index, query});
    const row = rows[index];
    if (row && !isHeaderRow(row)) onHighlight?.(row);
  };

  const handleSelect = (row: CommandPaletteHeaderRow | TRow): void => {
    if (!isHeaderRow(row)) onSelect(row);
  };

  const handleTab = (row: CommandPaletteHeaderRow | TRow): void => {
    if (!isHeaderRow(row)) onTab?.(row);
  };

  return (
    <>
      <SearchableList
        activeIndex={activeIndex}
        className="pt-1"
        estimateSize={(index) => (rows[index] && isHeaderRow(rows[index]) ? HEADER_ROW_HEIGHT : ITEM_ROW_HEIGHT)}
        getItemKey={(row) => (isHeaderRow(row) ? `header-${row.id}` : getRowKey(row))}
        isItemSelectable={(row) => !isHeaderRow(row)}
        items={[...rows]}
        listStatus={status}
        onActiveIndexChange={handleActiveIndexChange}
        onEndReached={onEndReached}
        onSelect={handleSelect}
        onSubmit={onSubmit}
        onTab={onTab && handleTab}
        renderInput={({onKeyDown}) => (
          <CommandPaletteInput onBack={onBack} onChange={onQueryChange} onKeyDown={onKeyDown} placeholder={placeholder} trailing={inputTrailing} value={query} />
        )}
        renderItem={(row, _index, renderProps) =>
          isHeaderRow(row) ? (
            <MenuLabel className="pb-1 text-xs">{row.title}</MenuLabel>
          ) : (
            renderRow(row, {highlighted: renderProps.highlighted, onSelect: renderProps.select, ref: renderProps.ref})
          )
        }
        virtualized
      />
      <CommandPaletteFooter canGoBack={onBack !== undefined} hints={hints} />
    </>
  );
}
