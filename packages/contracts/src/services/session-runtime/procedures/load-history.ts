import {z} from "zod";
import {SessionEntries} from "@supernova/contracts/services/sessions/schemas";

export const LoadHistoryPayload = z.object({
  sessionId: z.string(),
  /** Which half of the branch to read: shown turns before `edge` (`entries`), or undone turns after it (`undone`). */
  side: z.enum(["entries", "undone"]),
  /** The outermost entry the client has on that side; the page continues past it. */
  edge: z.number().int(),
});

/** One page of the requested side, in the same shape as the document's `entries` and `undone`. */
export const LoadHistoryResult = SessionEntries;

export type LoadHistoryPayload = z.infer<typeof LoadHistoryPayload>;
export type HistorySide = LoadHistoryPayload["side"];
export type LoadHistoryResult = z.infer<typeof LoadHistoryResult>;
