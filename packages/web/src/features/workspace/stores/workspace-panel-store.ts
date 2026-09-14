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
    create: () => ({id: "changes", kind: "changes", repositoryRoot: null, selection: null}),
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

/** A session's panel state. Kept per session so switching sessions restores each one's layout. */
export interface WorkspacePanelLayout {
  readonly activeTabId: string | null;
  readonly open: boolean;
  readonly tabs: readonly WorkspacePanelTab[];
}

export const EMPTY_LAYOUT: WorkspacePanelLayout = {activeTabId: null, open: false, tabs: []};

interface WorkspacePanelState {
  readonly layouts: Readonly<Record<string, WorkspacePanelLayout>>;
  readonly width: number;
  readonly closeTab: (sessionId: string, tabId: string) => void;
  /** Opens a new tab of the kind, or activates the existing one for singleton kinds. */
  readonly openTab: (sessionId: string, kind: WorkspacePanelTabKind) => void;
  readonly pinTab: (sessionId: string, tabId: string) => void;
  readonly setActiveTab: (sessionId: string, tabId: string) => void;
  /** Replaces a session's layout; used by tab-specific behavior such as opening a file. */
  readonly setLayout: (sessionId: string, layout: WorkspacePanelLayout) => void;
  readonly setWidth: (width: number, minWidth: number, maxWidth: number) => void;
  readonly togglePanel: (sessionId: string) => void;
  readonly updateTab: <TTab extends WorkspacePanelTab>(sessionId: string, tabId: string, update: (tab: TTab) => TTab) => void;
}

export const useWorkspacePanelStore = create<WorkspacePanelState>()(
  persist(
    (set) => {
      const updateLayout = (sessionId: string, update: (layout: WorkspacePanelLayout) => WorkspacePanelLayout): void => {
        set((state) => ({layouts: {...state.layouts, [sessionId]: update(state.layouts[sessionId] ?? EMPTY_LAYOUT)}}));
      };

      return {
        layouts: {},
        width: DEFAULT_WORKSPACE_PANEL_WIDTH,
        closeTab: (sessionId, tabId) =>
          updateLayout(sessionId, (layout) => ({
            ...layout,
            activeTabId: nextActiveTabId(layout.tabs, tabId, layout.activeTabId),
            tabs: layout.tabs.filter((tab) => tab.id !== tabId),
          })),
        openTab: (sessionId, kind) =>
          updateLayout(sessionId, (layout) => {
            const definition = WORKSPACE_TAB_KINDS[kind];
            const existing = definition.singleton ? layout.tabs.find((tab) => tab.kind === kind) : undefined;
            if (existing) return {...layout, activeTabId: existing.id};
            const created = definition.create();
            return {...layout, activeTabId: created.id, tabs: [...layout.tabs, created]};
          }),
        pinTab: (sessionId, tabId) =>
          updateLayout(sessionId, (layout) => ({...layout, tabs: layout.tabs.map((tab) => (tab.id === tabId ? (tabKind(tab).pin?.(tab) ?? tab) : tab))})),
        setActiveTab: (sessionId, activeTabId) => updateLayout(sessionId, (layout) => ({...layout, activeTabId})),
        setLayout: (sessionId, layout) => updateLayout(sessionId, () => layout),
        setWidth: (width, minWidth, maxWidth) => set({width: Math.min(Math.max(Math.round(width), minWidth), maxWidth)}),
        togglePanel: (sessionId) => updateLayout(sessionId, (layout) => ({...layout, open: !layout.open})),
        updateTab: (sessionId, tabId, update) =>
          updateLayout(sessionId, (layout) => ({...layout, tabs: layout.tabs.map((tab) => (tab.id === tabId ? update(tab as never) : tab))})),
      };
    },
    {
      name: "supernova-workspace-panel",
      storage: createJSONStorage(() => localStorage),
      partialize: ({width}) => ({width}),
    }
  )
);
