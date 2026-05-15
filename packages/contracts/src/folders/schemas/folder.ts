import {Schema} from "effect";

export const FolderSuggestion = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
});

export const FolderFile = Schema.Struct({
  path: Schema.String,
  title: Schema.String,
  subtitle: Schema.optional(Schema.String),
});

export const FolderQueryPathType = Schema.Union([Schema.Literal("directory"), Schema.Literal("file"), Schema.Literal("missing")]);

export type FolderSuggestion = typeof FolderSuggestion.Type;
export type FolderFile = typeof FolderFile.Type;
export type FolderQueryPathType = typeof FolderQueryPathType.Type;
