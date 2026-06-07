import {Schema} from "effect";
import {SessionSummary} from "@supernova/contracts/sessions/schemas";

export const ProjectSessionsListPayload = Schema.Struct({
  projectPath: Schema.String,
});

export const ProjectSessionsListResult = Schema.Struct({
  projectPath: Schema.String,
  sessions: Schema.Array(SessionSummary),
});

export class ProjectSessionsListError extends Schema.TaggedErrorClass<ProjectSessionsListError>()("ProjectSessionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ProjectSessionsListPayload = typeof ProjectSessionsListPayload.Type;
export type ProjectSessionsListResult = typeof ProjectSessionsListResult.Type;
