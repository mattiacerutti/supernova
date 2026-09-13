import {Schema} from "effect";

export const WorkspaceFileReadPayload = Schema.Struct({
  path: Schema.String,
  projectPath: Schema.String,
});

export const WorkspaceFileReadResult = Schema.Struct({
  content: Schema.String,
});

export type WorkspaceFileReadPayload = typeof WorkspaceFileReadPayload.Type;
export type WorkspaceFileReadResult = typeof WorkspaceFileReadResult.Type;
