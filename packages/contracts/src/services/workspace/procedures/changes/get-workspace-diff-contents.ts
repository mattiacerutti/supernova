import {z} from "zod";

export const WorkspaceDiffContentsGetPayload = z.object({
  /** Repository-relative, as reported by `getWorkspaceChanges`. */
  path: z.string(),
  projectPath: z.string(),
  repositoryRoot: z.string(),
});

/** Both sides in full so the client can show unchanged context on demand. A missing side (added or deleted file) is empty. */
export const WorkspaceDiffContentsGetResult = z.object({
  newContents: z.string(),
  oldContents: z.string(),
});

export type WorkspaceDiffContentsGetPayload = z.infer<typeof WorkspaceDiffContentsGetPayload>;
export type WorkspaceDiffContentsGetResult = z.infer<typeof WorkspaceDiffContentsGetResult>;
