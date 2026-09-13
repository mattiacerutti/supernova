import {Schema} from "effect";

export const WorkspaceDiffContentsGetPayload = Schema.Struct({
  path: Schema.String,
  projectPath: Schema.String,
});

/** Both sides in full so the client can show unchanged context on demand. A missing side (added or deleted file) is empty. */
export const WorkspaceDiffContentsGetResult = Schema.Struct({
  newContents: Schema.String,
  oldContents: Schema.String,
});

export type WorkspaceDiffContentsGetPayload = typeof WorkspaceDiffContentsGetPayload.Type;
export type WorkspaceDiffContentsGetResult = typeof WorkspaceDiffContentsGetResult.Type;
