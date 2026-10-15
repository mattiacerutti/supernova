import {create} from "zustand";
import type {PersistStorage} from "zustand/middleware";
import {persist} from "zustand/middleware";
import type {IconName} from "@/components/ui/icon";
import {isWindowsEnvironment} from "@/config/app-environment";
import {fileNameOf} from "@/features/workspace/lib/file-info";
import type {WorkspacePanelTab, WorkspacePanelTabKind, WorkspaceTerminalTab} from "@/features/workspace/types/workspace-panel";

const DEFAULT_WORKSPACE_PANEL_WIDTH = 348;
const BASE_MIN_WORKSPACE_PANEL_WIDTH = 280;
const WINDOWS_WINDOW_CONTROLS_WIDTH = 138;

export const MIN_WORKSPACE_PANEL_WIDTH = isWindowsEnvironment ? BASE_MIN_WORKSPACE_PANEL_WIDTH + WINDOWS_WINDOW_CONTROLS_WIDTH : BASE_MIN_WORKSPACE_PANEL_WIDTH;

interface TabPresentation {
  readonly icon: IconName | {readonly file: string};
  readonly label: string;
  readonly preview: boolean;
}

interface WorkspaceTabKind<TTab extends WorkspacePanelTab> {
  readonly icon: IconName;
  readonly label: string;
  readonly singleton: boolean;
  readonly create: () => TTab;
  readonly present: (tab: TTab) => TabPresentation;
  readonly pin?: (tab: TTab) => TTab;
}

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
  terminal: {
    create: () => ({id: `terminal:${crypto.randomUUID()}`, kind: "terminal"}),
    icon: "terminal",
    label: "Terminal",
    present: (tab) => ({icon: "terminal", label: terminalLabel(tab.number), preview: false}),
    singleton: false,
  },
} satisfies {readonly [K in WorkspacePanelTabKind]: WorkspaceTabKind<Extract<WorkspacePanelTab, {kind: K}>>};

export function terminalLabel(number: number | undefined): string {
  return number === undefined ? "Terminal" : `Terminal ${number}`;
}

export function tabKind<TTab extends WorkspacePanelTab>(tab: TTab): WorkspaceTabKind<TTab> {
  return WORKSPACE_TAB_KINDS[tab.kind] as unknown as WorkspaceTabKind<TTab>;
}

function nextActiveTabId(tabs: readonly WorkspacePanelTab[], closedId: string, activeId: string | null): string | null {
  if (activeId !== closedId) return activeId;
  const remaining = tabs.filter((tab) => tab.id !== closedId);
  const closedIndex = tabs.findIndex((tab) => tab.id === closedId);
  return remaining[Math.min(closedIndex, remaining.length - 1)]?.id ?? null;
}

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
  readonly openTab: (sessionId: string, kind: WorkspacePanelTabKind) => void;
  readonly attachTerminal: (sessionId: string, terminal: Pick<WorkspaceTerminalTab, "exitCode" | "id" | "number">) => void;
  readonly pinTab: (sessionId: string, tabId: string) => void;
  readonly setActiveTab: (sessionId: string, tabId: string) => void;
  readonly setLayout: (sessionId: string, layout: WorkspacePanelLayout) => void;
  readonly setWidth: (width: number, minWidth: number, maxWidth: number) => void;
  readonly togglePanel: (sessionId: string) => void;
  readonly updateTab: <TTab extends WorkspacePanelTab>(sessionId: string, tabId: string, update: (tab: TTab) => TTab) => void;
}

export const WORKSPACE_PANEL_HOTKEY = "Mod+Alt+B";

type PersistedPanel = Pick<WorkspacePanelState, "layouts" | "width">;

/** Width is app-wide (`localStorage`); layouts are per window (`sessionStorage`), so a new window starts clean. */
const panelStorage: PersistStorage<PersistedPanel> = {
  getItem: (name) => {
    const width = readState<Pick<PersistedPanel, "width">>(localStorage, name)?.width;
    const layouts = readState<Pick<PersistedPanel, "layouts">>(sessionStorage, name)?.layouts;
    return {state: {layouts: layouts ?? {}, width: width ?? DEFAULT_WORKSPACE_PANEL_WIDTH}};
  },
  setItem: (name, {state, version}) => {
    localStorage.setItem(name, JSON.stringify({state: {width: state.width}, version}));
    sessionStorage.setItem(name, JSON.stringify({state: {layouts: state.layouts}, version}));
  },
  removeItem: (name) => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(name);
  },
};

function readState<T>(storage: Storage, name: string): Partial<T> | undefined {
  try {
    const raw = storage.getItem(name);
    return raw ? (JSON.parse(raw) as {state?: Partial<T>}).state : undefined;
  } catch {
    return undefined;
  }
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
        attachTerminal: (sessionId, terminal) =>
          updateLayout(sessionId, (layout) => {
            if (layout.tabs.some((tab) => tab.id === terminal.id)) return {...layout, activeTabId: terminal.id};
            const tab: WorkspaceTerminalTab = {kind: "terminal", ...terminal};
            return {...layout, activeTabId: tab.id, tabs: [...layout.tabs, tab]};
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
      storage: panelStorage,
      partialize: ({layouts, width}) => ({layouts, width}),
    }
  )
);
