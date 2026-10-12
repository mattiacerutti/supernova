import {z} from "zod";

export const WorkspaceFileReadPayload = z.object({
  path: z.string(),
  projectPath: z.string(),
});

export const WorkspaceFileReadResult = z.object({
  content: z.string(),
});

export type WorkspaceFileReadPayload = z.infer<typeof WorkspaceFileReadPayload>;
export type WorkspaceFileReadResult = z.infer<typeof WorkspaceFileReadResult>;
