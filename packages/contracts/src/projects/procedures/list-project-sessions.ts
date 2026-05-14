import {Schema} from "effect";
import {SessionSummary} from "@pi-desktop/contracts/sessions/schemas";

export const ProjectSessionsListPayload = Schema.Struct({
  cursor: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.Number),
  projectPath: Schema.String,
});

export const ProjectSessionsListResult = Schema.Struct({
  hasMore: Schema.Boolean,
  nextCursor: Schema.optional(Schema.String),
  projectPath: Schema.String,
  sessions: Schema.Array(SessionSummary),
});

export class ProjectSessionsListError extends Schema.TaggedErrorClass<ProjectSessionsListError>()("ProjectSessionsListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ProjectSessionsListPayload = typeof ProjectSessionsListPayload.Type;
export type ProjectSessionsListResult = typeof ProjectSessionsListResult.Type;
