import {create} from "zustand";
import {createJSONStorage, persist} from "zustand/middleware";
import type {IconName} from "@/components/ui/icon";
import {fileNameOf} from "@/features/workspace/lib/file-info";
import type {WorkspacePanelTab, WorkspacePanelTabKind} from "@/features/workspace/types/workspace-panel";

const DEFAULT_WORKSPACE_PANEL_WIDTH = 348;

interface TabPresentation {
  /** Shown as the tab icon; a file path renders that file's type icon instead. */
  readonly icon: IconName | {readonly file: string};
  readonly label: string;
  /** Preview tabs show whatever was last selected; pinning makes the content theirs. */
  readonly preview: boolean;
}

interface WorkspaceTabKind<TTab extends WorkspacePanelTab> {
  readonly icon: IconName;
  readonly label: string;
  /** At most one open at a time; opening again activates it and the + menu hides it. */
  readonly singleton: boolean;
  readonly create: () => TTab;
  readonly present: (tab: TTab) => TabPresentation;
  readonly pin?: (tab: TTab) => TTab;
}

/** Everything the panel and store need to know per tab kind. Adding a kind means adding an entry here and a `renderTab` case in the panel. */
export const WORKSPACE_TAB_KINDS = {
  changes: {
    create: () => ({id: "changes", kind: "changes", selection: null}),
    icon: "git-commit",
    label: "Changes",
    present: () => ({icon: "git-commit", label: "Changes", preview: false}),
    singleton: true,
  },
  files: {
    create: () => ({file: null, id: `files:${crypto.randomUUID()}`, kind: "files", pinned: false}),
    icon: "folder",
    label: "Files",
    pin: (tab) => (tab.file === null ? tab : {...tab, pinned: true}),
    present: (tab) => (tab.file === null ? {icon: "folder", label: "Files", preview: false} : {icon: {file: tab.file}, label: fileNameOf(tab.file), preview: !tab.pinned}),
    singleton: false,
  },
} satisfies {readonly [K in WorkspacePanelTabKind]: WorkspaceTabKind<Extract<WorkspacePanelTab, {kind: K}>>};

export function tabKind<TTab extends WorkspacePanelTab>(tab: TTab): WorkspaceTabKind<TTab> {
  return WORKSPACE_TAB_KINDS[tab.kind] as unknown as WorkspaceTabKind<TTab>;
}

/** Falls back to the same slot, or the last tab when the closed one was rightmost. */
export function nextActiveTabId(tabs: readonly WorkspacePanelTab[], closedId: string, activeId: string | null): string | null {
  if (activeId !== closedId) return activeId;
  const remaining = tabs.filter((tab) => tab.id !== closedId);
  const closedIndex = tabs.findIndex((tab) => tab.id === closedId);
  return remaining[Math.min(closedIndex, remaining.length - 1)]?.id ?? null;
}

interface WorkspacePanelState {
  readonly activeTabId: string | null;
  readonly open: boolean;
  readonly tabs: readonly WorkspacePanelTab[];
  readonly width: number;
  readonly closeTab: (tabId: string) => void;
  /** Opens a new tab of the kind after the active one, or activates the existing one for singleton kinds. */
  readonly openTab: (kind: WorkspacePanelTabKind) => void;
  readonly pinTab: (tabId: string) => void;
  readonly setActiveTab: (tabId: string) => void;
  /** Replaces the whole tab list; used by tab-specific behavior such as opening a file. */
  readonly setTabs: (tabs: readonly WorkspacePanelTab[], activeTabId: string) => void;
  readonly setWidth: (width: number, minWidth: number, maxWidth: number) => void;
  readonly togglePanel: () => void;
  readonly updateTab: <TTab extends WorkspacePanelTab>(tabId: string, update: (tab: TTab) => TTab) => void;
}

export const useWorkspacePanelStore = create<WorkspacePanelState>()(
  persist(
    (set) => ({
      activeTabId: null,
      open: false,
      tabs: [],
      width: DEFAULT_WORKSPACE_PANEL_WIDTH,
      closeTab: (tabId) => set((state) => ({activeTabId: nextActiveTabId(state.tabs, tabId, state.activeTabId), tabs: state.tabs.filter((tab) => tab.id !== tabId)})),
      openTab: (kind) =>
        set((state) => {
          const definition = WORKSPACE_TAB_KINDS[kind];
          const existing = definition.singleton ? state.tabs.find((tab) => tab.kind === kind) : undefined;
          if (existing) return {activeTabId: existing.id};
          const created = definition.create();
          return {activeTabId: created.id, tabs: [...state.tabs, created]};
        }),
      pinTab: (tabId) => set((state) => ({tabs: state.tabs.map((tab) => (tab.id === tabId ? (tabKind(tab).pin?.(tab) ?? tab) : tab))})),
      setActiveTab: (activeTabId) => set({activeTabId}),
      setTabs: (tabs, activeTabId) => set({activeTabId, tabs}),
      setWidth: (width, minWidth, maxWidth) => set({width: Math.min(Math.max(Math.round(width), minWidth), maxWidth)}),
      togglePanel: () => set((state) => ({open: !state.open})),
      updateTab: (tabId, update) => set((state) => ({tabs: state.tabs.map((tab) => (tab.id === tabId ? update(tab as never) : tab))})),
    }),
    {
      name: "supernova-workspace-panel",
      storage: createJSONStorage(() => localStorage),
      partialize: ({open, width}) => ({open, width}),
    }
  )
);
