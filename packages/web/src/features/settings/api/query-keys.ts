export const settingsKeys = {
  all: ["settings"] as const,
  providers: () => [...settingsKeys.all, "providers"] as const,
};
