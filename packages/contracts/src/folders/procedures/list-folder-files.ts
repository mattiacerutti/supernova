import {Schema} from "effect";
import {FolderFile} from "@supernova/contracts/folders/schemas";

export const FolderFilesListPayload = Schema.Struct({
  projectPath: Schema.String,
  query: Schema.String,
});

export const FolderFilesListResult = Schema.Struct({
  items: Schema.Array(FolderFile),
  query: Schema.String,
});

export class FolderFilesListError extends Schema.TaggedErrorClass<FolderFilesListError>()("FolderFilesListError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export type FolderFilesListPayload = typeof FolderFilesListPayload.Type;
export type FolderFilesListResult = typeof FolderFilesListResult.Type;
