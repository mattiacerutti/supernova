/** Query keys for settings data. */
export const settingsKeys = {
  all: ["settings"] as const,
  providers: () => [...settingsKeys.all, "providers"] as const,
};
