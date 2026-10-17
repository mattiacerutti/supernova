import {createContext, useContext, useState} from "react";
import type {VirtualItem} from "@tanstack/react-virtual";

interface WorkExpansionState {
  readonly expanded: Map<string, boolean>;
  readonly measurements: Map<string, VirtualItem[]>;
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

export function useWorkExpansionState(onToggle: () => void): WorkExpansionState {
  // Virtual rows may disappear; their expansion choices belong to the session viewport.
  const [state] = useState(() => ({
    expanded: new Map<string, boolean>(),
    measurements: new Map<string, VirtualItem[]>(),
  }));
  return {...state, onToggle};
}
