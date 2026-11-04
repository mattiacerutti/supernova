import {z} from "zod";
import {SessionSummary} from "@supernova/contracts/services/sessions/schemas";

export const SESSION_SEARCH_LIMIT = 100;

export const SearchSessionsPayload = z.object({
  /** Matched against titles, case-insensitively; empty matches every session. */
  text: z.string(),
  projectPaths: z.array(z.string()),
  limit: z.number().int().min(1).max(SESSION_SEARCH_LIMIT),
  /** The previous page's `nextCursor`; absent for the first page. */
  cursor: z.string().optional(),
});

export const SearchSessionsResult = z.object({
  sessions: z.array(SessionSummary.extend({projectPath: z.string()})),
  /** Reads the next page; `null` on the last one. */
  nextCursor: z.string().nullable(),
});

export type SearchSessionsPayload = z.infer<typeof SearchSessionsPayload>;
export type SearchSessionsResult = z.infer<typeof SearchSessionsResult>;
