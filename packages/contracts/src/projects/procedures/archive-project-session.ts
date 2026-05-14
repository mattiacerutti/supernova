import {Schema} from "effect";

export const ProjectSessionArchivePayload = Schema.Struct({
  projectPath: Schema.String,
  sessionId: Schema.String,
});

export const ProjectSessionArchiveResult = Schema.Struct({
  projectPath: Schema.String,
  sessionId: Schema.String,
});

export class ProjectSessionArchiveError extends Schema.TaggedErrorClass<ProjectSessionArchiveError>()("ProjectSessionArchiveError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type ProjectSessionArchivePayload = typeof ProjectSessionArchivePayload.Type;
export type ProjectSessionArchiveResult = typeof ProjectSessionArchiveResult.Type;
