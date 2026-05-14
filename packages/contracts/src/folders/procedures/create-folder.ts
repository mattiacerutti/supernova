import {Schema} from "effect";

export const FolderCreatePayload = Schema.Struct({
  path: Schema.String,
});

export const FolderCreateResult = Schema.Struct({
  path: Schema.String,
});

export class FolderCreateError extends Schema.TaggedErrorClass<FolderCreateError>()("FolderCreateError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type FolderCreatePayload = typeof FolderCreatePayload.Type;
export type FolderCreateResult = typeof FolderCreateResult.Type;
