import {Schema} from "effect";

export const FolderSuggestion = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
});

export const FolderQueryPathType = Schema.Union([Schema.Literal("directory"), Schema.Literal("file"), Schema.Literal("missing")]);

export type FolderSuggestion = typeof FolderSuggestion.Type;
export type FolderQueryPathType = typeof FolderQueryPathType.Type;
