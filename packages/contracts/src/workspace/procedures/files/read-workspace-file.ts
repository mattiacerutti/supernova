import {z} from "zod";
import {struct} from "@supernova/contracts/runtime/schemas";

export const WorkspaceFileReadPayload = struct({
  path: z.string(),
  projectPath: z.string(),
});

export const WorkspaceFileReadResult = struct({
  content: z.string(),
});

export type WorkspaceFileReadPayload = z.infer<typeof WorkspaceFileReadPayload>;
export type WorkspaceFileReadResult = z.infer<typeof WorkspaceFileReadResult>;
