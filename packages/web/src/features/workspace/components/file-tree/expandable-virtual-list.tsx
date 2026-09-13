import {useVirtualizer} from "@tanstack/react-virtual";
import type {VirtualItem} from "@tanstack/react-virtual";
import {useReducedMotion} from "framer-motion";
import {useRef, useState} from "react";
import type {ReactNode, TransitionEvent} from "react";

const DURATION_MS = 200;
const OVERSCAN_ROWS = 12;
const OVERSCAN_PX = 200;
const TRANSITION = `height ${DURATION_MS}ms ease-out, transform ${DURATION_MS}ms ease-out`;

export interface ExpansionOptions {
  readonly count: number;
  readonly firstIndex: number;
  readonly heightPx: number;
  /** Commits the row removal once the collapse has animated. */
  readonly onCollapsed?: () => void;
  readonly phase: "collapse" | "expand";
  readonly topPx: number;
}

interface Expansion extends ExpansionOptions {
  /** Group height, capped at what fits on screen. */
  readonly slidePx: number;
  readonly started: boolean;
}

interface ExpandableVirtualListProps {
  readonly estimateSize: (index: number) => number;
  readonly getKey: (index: number) => string;
  readonly label: string;
  readonly renderRow: (index: number, expand: (options: ExpansionOptions) => void) => ReactNode;
  readonly role: "list" | "tree";
  readonly rowCount: number;
}

/**
 * Virtualized rows are absolutely positioned, so no container can animate its own height.
 * Instead the group is clipped into a block whose height animates while the rows after it
 * slide by the same distance. Collapses animate first; the caller removes rows in `onCollapsed`.
 */
export default function ExpandableVirtualList(props: ExpandableVirtualListProps) {
  const {estimateSize, getKey, label, renderRow, role, rowCount} = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingCollapseRef = useRef<(() => void) | null>(null);
  const safetyTimerRef = useRef(0);
  const [expansion, setExpansion] = useState<Expansion | null>(null);
  const reducedMotion = useReducedMotion();

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual owns mutable scroll state by design.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rowCount,
    estimateSize,
    getItemKey: getKey,
    getScrollElement: () => scrollRef.current,
    overscan: OVERSCAN_ROWS,
  });

  const settle = (): void => {
    window.clearTimeout(safetyTimerRef.current);
    const commitCollapse = pendingCollapseRef.current;
    pendingCollapseRef.current = null;
    setExpansion(null);
    commitCollapse?.();
  };

  const expand = (options: ExpansionOptions): void => {
    settle();

    if (reducedMotion === true || options.count === 0) {
      options.onCollapsed?.();
      return;
    }

    const scrollElement = scrollRef.current;
    const spaceBelowGroupPx = scrollElement === null ? Infinity : scrollElement.scrollTop + scrollElement.clientHeight - options.topPx;
    pendingCollapseRef.current = options.onCollapsed ?? null;
    setExpansion({...options, slidePx: Math.max(Math.min(options.heightPx, spaceBelowGroupPx), 0), started: false});
    requestAnimationFrame(() => setExpansion((current) => (current === null ? null : {...current, started: true})));
    safetyTimerRef.current = window.setTimeout(settle, DURATION_MS * 1.5);
  };

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>): void => {
    if (event.propertyName === "height" && event.target === event.currentTarget) settle();
  };

  const positioned = (item: VirtualItem, topPx = item.start): ReactNode => (
    <div className="absolute inset-x-0 top-0" key={item.key} style={{height: `${item.size}px`, transform: `translateY(${topPx}px)`}}>
      {renderRow(item.index, expand)}
    </div>
  );

  const renderAnimating = (current: Expansion): ReactNode => {
    const {firstIndex, heightPx, slidePx, started, phase, topPx} = current;
    const lastIndex = firstIndex + current.count - 1;
    const groupOpen = (phase === "expand") === started;
    const belowOffsetPx = groupOpen ? slidePx : 0;

    // The virtualizer only lays out the settled window, so rows passing through the viewport mid-animation are laid out by hand.
    const viewportTop = (virtualizer.scrollOffset ?? 0) - OVERSCAN_PX;
    const viewportBottom = viewportTop + (scrollRef.current?.clientHeight ?? 0) + OVERSCAN_PX * 2;
    const above: ReactNode[] = [];
    const inside: ReactNode[] = [];
    const below: ReactNode[] = [];
    let start = 0;
    for (let index = 0; index < rowCount; index += 1) {
      const size = estimateSize(index);
      const item: VirtualItem = {end: start + size, index, key: getKey(index), lane: 0, size, start};
      if (index < firstIndex && item.end >= viewportTop && start <= viewportBottom) above.push(positioned(item));
      else if (index <= lastIndex && item.end >= viewportTop && start <= topPx + slidePx) inside.push(positioned(item, start - topPx));
      else if (index > lastIndex && item.end - heightPx + slidePx >= viewportTop && start - heightPx <= viewportBottom) below.push(positioned(item, start - heightPx));
      start += size;
    }

    return (
      <>
        {above}
        <div
          className="absolute inset-x-0 overflow-hidden"
          onTransitionEnd={handleTransitionEnd}
          style={{height: `${groupOpen ? slidePx : 0}px`, top: `${topPx}px`, transition: TRANSITION}}
        >
          {inside}
        </div>
        <div className="absolute inset-x-0 top-0 h-0" style={{transform: `translateY(${belowOffsetPx}px)`, transition: TRANSITION}}>
          {below}
        </div>
      </>
    );
  };

  return (
    <div aria-label={label} className="scroll-fade-y min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2" ref={scrollRef} role={role}>
      <div className="relative w-full" style={{height: `${virtualizer.getTotalSize()}px`}}>
        {expansion === null ? virtualizer.getVirtualItems().map((item) => positioned(item)) : renderAnimating(expansion)}
      </div>
    </div>
  );
}
