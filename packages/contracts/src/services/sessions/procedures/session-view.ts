import {int, obj, type Static, str} from "@earendil-works/chord";

export const PROJECT_WINDOW_INCREMENT_LIMIT = 500;

export const ShowProjectPayload = obj({
  projectPath: str({min: 1}),
  // No maximum: a reconnect restores the accumulated depth.
  depth: int({min: 1}),
});

export const HideProjectPayload = obj({projectPath: str({min: 1})});

export const LoadMoreProjectPayload = obj({
  projectPath: str({min: 1}),
  by: int({min: 1, max: PROJECT_WINDOW_INCREMENT_LIMIT}),
});

export const OpenSessionPayload = obj({sessionId: str({min: 1})});

export type OpenSessionPayload = Static<typeof OpenSessionPayload>;
export type ShowProjectPayload = Static<typeof ShowProjectPayload>;
export type HideProjectPayload = Static<typeof HideProjectPayload>;
export type LoadMoreProjectPayload = Static<typeof LoadMoreProjectPayload>;
