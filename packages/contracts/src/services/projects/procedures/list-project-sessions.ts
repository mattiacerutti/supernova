import {z} from "zod";
import {SESSION_PAGE_LIMIT} from "@supernova/contracts/services/projects/schemas";
import {SessionSummary} from "@supernova/contracts/services/sessions/schemas";

export const ProjectSessionsListPayload = z.object({
  projectPath: z.string(),
  limit: z.number().int().min(1).max(SESSION_PAGE_LIMIT),
  /** The previous page's `nextCursor`; absent for the first page. */
  cursor: z.string().optional(),
});

/** One page of a project's sessions, pinned first, then newest. */
export const ProjectSessionsListResult = z.object({
  projectPath: z.string(),
  sessions: z.array(SessionSummary),
  /** Reads the next page; `null` on the last one. */
  nextCursor: z.string().nullable(),
});

export type ProjectSessionsListPayload = z.infer<typeof ProjectSessionsListPayload>;
export type ProjectSessionsListResult = z.infer<typeof ProjectSessionsListResult>;
