import {int, obj, oneOf, type Static} from "@earendil-works/chord";
import {SessionEntries} from "@supernova/contracts/services/sessions/schemas";

export const LoadHistoryPayload = obj({
  side: oneOf("entries", "undone"),
  /** The outermost entry the client has on that side. */
  edge: int(),
});

export const LoadHistoryResult = SessionEntries;

export type LoadHistoryPayload = Static<typeof LoadHistoryPayload>;
export type HistorySide = LoadHistoryPayload["side"];
export type LoadHistoryResult = Static<typeof LoadHistoryResult>;
