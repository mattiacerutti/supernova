import {defaultRangeExtractor, observeElementOffset, useVirtualizer} from "@tanstack/react-virtual";
import {useLayoutEffect, useRef, useState} from "react";
import type {ReactNode} from "react";
import {useWorkMeasurements} from "@/features/sessions/hooks/use-work-expansion";

interface VirtualWorkListProps {
  readonly count: number;
  readonly estimateSize: (index: number) => number;
  readonly getKey: (index: number) => string;
  readonly id: string;
  readonly renderRow: (index: number) => ReactNode;
}

export default function VirtualWorkList(props: VirtualWorkListProps) {
  const {count, estimateSize, getKey, id, renderRow} = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const syncOffsetRef = useRef<(() => void) | null>(null);
  const measurements = useWorkMeasurements();
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack owns mutable measurement state.
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count,
    estimateSize,
    getItemKey: getKey,
    getScrollElement: () => bodyRef.current?.closest<HTMLDivElement>('[data-slot="message-scroller-viewport"]') ?? null,
    indexAttribute: "data-work-index",
    initialMeasurementsCache: measurements?.get(id),
    overscan: 3,
    directDomUpdates: true,
    directDomUpdatesMode: "position",
    onChange: (instance) => {
      // A measured row can change the range before React removes the old mounted window.
      for (const [key, element] of instance.elementsCache) {
        const row = instance.measurementsCache[instance.indexFromElement(element)];
        if (row?.key === key && element.style.top !== `${row.start}px`) element.style.top = `${row.start}px`;
      }
    },
    observeElementOffset: (instance, onOffsetChange) => {
      const viewport = instance.scrollElement!;
      const body = bodyRef.current!;
      // Express the shared viewport in this body's coordinates, including expanding or collapsing ancestors.
      const sync = (scrolling = false): void => onOffsetChange(viewport.getBoundingClientRect().top - body.getBoundingClientRect().top, scrolling);
      syncOffsetRef.current = sync;
      const unobserve = observeElementOffset(instance, (_offset, scrolling) => sync(scrolling));
      const observer = new ResizeObserver(() => sync());
      observer.observe(viewport);
      observer.observe(body);
      const canvas = body.closest("[data-timeline-virtual-content]");
      if (canvas) observer.observe(canvas);
      sync();
      return () => {
        observer.disconnect();
        unobserve?.();
        syncOffsetRef.current = null;
      };
    },
    scrollToFn: (_offset, {adjustments}, instance) => {
      if (adjustments === undefined || !instance.scrollElement) return;
      instance.scrollElement.scrollTop += adjustments;
      syncOffsetRef.current?.();
    },
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (focusedIndex === null) return indexes;
      return [...new Set([...indexes, Math.max(0, focusedIndex - 1), focusedIndex, Math.min(count - 1, focusedIndex + 1)])].sort((a, b) => a - b);
    },
  });
  // Ancestors correct completely offscreen groups; only this list corrects its partially visible body.
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (row) => {
    const offset = virtualizer.scrollOffset ?? 0;
    return row.end <= offset && offset < virtualizer.getTotalSize();
  };

  useLayoutEffect(
    () => () => {
      measurements?.set(id, virtualizer.takeSnapshot());
    },
    [id, measurements, virtualizer]
  );

  return (
    <div
      className="relative"
      data-work-list={id}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocusedIndex(null);
      }}
      onFocusCapture={(event) => {
        const row = [...event.currentTarget.children].find((child) => child.contains(event.target)) as HTMLElement | undefined;
        if (row) setFocusedIndex(Number(row.dataset.workIndex));
      }}
      ref={(element) => {
        bodyRef.current = element;
        virtualizer.containerRef(element);
      }}
    >
      {virtualizer.getVirtualItems().map((row) => (
        <div className="absolute inset-x-0 top-0" data-work-index={row.index} key={row.key} ref={virtualizer.measureElement}>
          {renderRow(row.index)}
        </div>
      ))}
    </div>
  );
}
