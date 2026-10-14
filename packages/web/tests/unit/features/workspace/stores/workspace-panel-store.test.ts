import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

const STORAGE_KEY = "supernova-workspace-panel";

describe("workspace panel store", () => {
  let localStorage: Storage;
  let sessionStorage: Storage;

  beforeEach(() => {
    localStorage = createStorage();
    sessionStorage = createStorage();
    vi.resetModules();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("sessionStorage", sessionStorage);
    vi.stubGlobal("window", {localStorage, sessionStorage});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const loadStore = async () => (await import("@/features/workspace/stores/workspace-panel-store")).useWorkspacePanelStore;

  it("keeps a window's layouts in its session storage and the width app-wide, so a reload reattaches its terminals", async () => {
    const store = await loadStore();
    store.getState().openTab("s1", "terminal");
    const tab = store.getState().layouts.s1!.tabs[0]!;
    store.getState().updateTab("s1", tab.id, (current) => ({...current, number: 1}));
    store.getState().setWidth(400, 280, 800);

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).state).toEqual({width: 400});
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY)!).state.layouts.s1.tabs).toEqual([{id: tab.id, kind: "terminal", number: 1}]);

    // A reload of the same window restores its tabs; the tab has a number, so it reattaches instead of starting a shell.
    vi.resetModules();
    const reloaded = await loadStore();
    expect(reloaded.getState().layouts.s1?.tabs).toEqual([{id: tab.id, kind: "terminal", number: 1}]);
    expect(reloaded.getState().width).toBe(400);
  });

  it("starts a new window without another window's tabs, but with the app's width", async () => {
    const store = await loadStore();
    store.getState().openTab("s1", "terminal");
    store.getState().setWidth(420, 280, 800);

    // A new window has its own session storage.
    vi.resetModules();
    vi.stubGlobal("sessionStorage", createStorage());
    const other = await loadStore();
    expect(other.getState().layouts).toEqual({});
    expect(other.getState().width).toBe(420);
  });

  it("attaching to a terminal adds and activates its tab once, and activates it again instead of duplicating it", async () => {
    const store = await loadStore();
    store.getState().openTab("s1", "files");
    store.getState().attachTerminal("s1", {id: "terminal:a", number: 2});
    expect(store.getState().layouts.s1?.activeTabId).toBe("terminal:a");

    const files = store.getState().layouts.s1!.tabs[0]!;
    store.getState().setActiveTab("s1", files.id);
    store.getState().attachTerminal("s1", {id: "terminal:a", number: 2});
    expect(store.getState().layouts.s1?.tabs.filter((tab) => tab.kind === "terminal")).toEqual([{id: "terminal:a", kind: "terminal", number: 2}]);
    expect(store.getState().layouts.s1?.activeTabId).toBe("terminal:a");
  });
});
