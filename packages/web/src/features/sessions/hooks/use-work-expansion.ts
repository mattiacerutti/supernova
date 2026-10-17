import {createContext, useContext, useLayoutEffect, useRef, useState} from "react";
import type {UIEvent} from "react";
import type {VirtualItem} from "@tanstack/react-virtual";

interface OutputScrollPosition {
  readonly top: number;
  readonly left: number;
}

interface WorkExpansionState {
  readonly expanded: Map<string, boolean>;
  readonly measurements: Map<string, VirtualItem[]>;
  readonly outputScroll: Map<string, readonly OutputScrollPosition[]>;
  readonly onToggle: () => void;
}

export const WorkExpansionContext = createContext<WorkExpansionState | null>(null);

export function useWorkMeasurements() {
  return useContext(WorkExpansionContext)?.measurements;
}

export function useWorkExpansion(id: string, fallback = false) {
  const context = useContext(WorkExpansionContext);
  const saved = context?.expanded;
  const [choice, setChoice] = useState(() => saved?.get(id));
  const expanded = choice ?? fallback;
  return {
    expanded,
    toggle: (): void => {
      context?.onToggle();
      saved?.set(id, !expanded);
      setChoice(!expanded);
    },
  };
}

export function useWorkOutputScroll(id: string, expanded: boolean) {
  const positions = useContext(WorkExpansionContext)?.outputScroll;
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!expanded || !positions || !ref.current) return;
    const elements = [...ref.current.querySelectorAll<HTMLElement>("[data-scrollable]")];
    const restore = (): void => {
      elements.forEach((element, index) => {
        const saved = positions.get(id)?.[index];
        // Diffs can finish rendering after this commit; wait until the saved offset fits.
        if (saved && element.scrollHeight - element.clientHeight >= saved.top && element.scrollWidth - element.clientWidth >= saved.left) {
          element.scrollTop = saved.top;
          element.scrollLeft = saved.left;
        }
      });
    };
    const observer = new ResizeObserver(restore);
    for (const element of elements) {
      observer.observe(element);
      if (element.firstElementChild) observer.observe(element.firstElementChild);
    }
    restore();
    return () => observer.disconnect();
  }, [expanded, id, positions]);
  return {
    ref,
    onScrollCapture: (event: UIEvent<HTMLDivElement>): void => {
      positions?.set(
        id,
        [...event.currentTarget.querySelectorAll<HTMLElement>("[data-scrollable]")].map((element) => ({top: element.scrollTop, left: element.scrollLeft}))
      );
    },
  };
}

export function useWorkExpansionState(onToggle: () => void): WorkExpansionState {
  // Virtual rows may disappear; their expansion choices belong to the session viewport.
  const [state] = useState(() => ({
    expanded: new Map<string, boolean>(),
    measurements: new Map<string, VirtualItem[]>(),
    outputScroll: new Map<string, readonly OutputScrollPosition[]>(),
  }));
  return {...state, onToggle};
}
