import {z} from "zod";
import {SessionSummary} from "@supernova/contracts/services/sessions/schemas";

export const ProjectSessionsListPayload = z.object({
  projectPath: z.string(),
});

export const ProjectSessionsListResult = z.object({
  projectPath: z.string(),
  sessions: z.array(SessionSummary),
});

export type ProjectSessionsListPayload = z.infer<typeof ProjectSessionsListPayload>;
export type ProjectSessionsListResult = z.infer<typeof ProjectSessionsListResult>;
