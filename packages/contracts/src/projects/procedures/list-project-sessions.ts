import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";
import {SessionSummary} from "@supernova/contracts/sessions/schemas";

export const ProjectSessionsListPayload = struct({
  projectPath: z.string(),
});

export const ProjectSessionsListResult = struct({
  projectPath: z.string(),
  sessions: array(SessionSummary),
});

export type ProjectSessionsListPayload = z.infer<typeof ProjectSessionsListPayload>;
export type ProjectSessionsListResult = z.infer<typeof ProjectSessionsListResult>;
