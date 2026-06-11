import type {ModelReference} from "@supernova/contracts/sessions/schemas";
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

const selectedModel = {
  id: "claude-sonnet",
  providerId: "anthropic",
  thinkingLevel: "high",
} satisfies ModelReference;

describe("session models store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("window", {localStorage: createLocalStorage()});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores model selections per session", async () => {
    const {useSessionModelsStore} = await import("@/features/sessions/stores/session-models-store");

    useSessionModelsStore.getState().setSessionModel("session-1", selectedModel);

    expect(useSessionModelsStore.getState().getSessionModel("session-1")).toEqual(selectedModel);
    expect(useSessionModelsStore.getState().getSessionModel("session-2")).toBeUndefined();
    expect(useSessionModelsStore.getState().getSessionModel("")).toBeUndefined();
  });
});
