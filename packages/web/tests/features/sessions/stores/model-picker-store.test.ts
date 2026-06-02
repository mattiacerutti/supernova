import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

function createLocalStorage() {
  const values = new Map<string, string>();
  return {
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => Array.from(values.keys())[index] ?? null),
    get length() {
      return values.size;
    },
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  } satisfies Storage;
}

describe("model picker store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {localStorage: createLocalStorage()});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps recent models unique and capped", async () => {
    const {useModelPickerStore} = await import("@/features/sessions/stores/model-picker-store");

    for (const key of ["one", "two", "three", "four", "five", "six", "three"]) {
      useModelPickerStore.getState().recordRecentModel(key);
    }

    expect(useModelPickerStore.getState().recentModelKeys).toEqual(["three", "six", "five", "four", "two"]);
  });

  it("toggles favorites and stores the last thinking level", async () => {
    const {useModelPickerStore} = await import("@/features/sessions/stores/model-picker-store");

    useModelPickerStore.getState().toggleFavoriteModel("anthropic:claude");
    useModelPickerStore.getState().toggleFavoriteModel("openai:gpt");
    useModelPickerStore.getState().toggleFavoriteModel("anthropic:claude");
    useModelPickerStore.getState().setLastThinkingLevel("high");

    expect(useModelPickerStore.getState()).toMatchObject({favoriteModelKeys: ["openai:gpt"], lastThinkingLevel: "high"});
  });
});
