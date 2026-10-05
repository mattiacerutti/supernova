import {z} from "zod";
import {SESSION_PAGE_LIMIT} from "@supernova/contracts/services/projects/schemas";
import {SessionSummary} from "@supernova/contracts/services/sessions/schemas";

export const ProjectSessionsSearchPayload = z.object({
  /** Matched against titles, case-insensitively; empty matches every session. */
  query: z.string(),
  /** The projects to search. */
  projectPaths: z.array(z.string()),
  limit: z.number().int().min(1).max(SESSION_PAGE_LIMIT),
  /** The previous page's `nextCursor`; absent for the first page. */
  cursor: z.string().optional(),
});

/** One page of matching sessions across projects, newest first. */
export const ProjectSessionsSearchResult = z.object({
  sessions: z.array(SessionSummary.extend({projectPath: z.string()})),
  /** Reads the next page; `null` on the last one. */
  nextCursor: z.string().nullable(),
});

export type ProjectSessionsSearchPayload = z.infer<typeof ProjectSessionsSearchPayload>;
export type ProjectSessionsSearchResult = z.infer<typeof ProjectSessionsSearchResult>;
