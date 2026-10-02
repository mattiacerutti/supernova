import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";

export const WorkspaceFilesListPayload = struct({
  projectPath: z.string(),
});

/** Tracked and untracked-but-not-ignored files of every discovered repository, project-relative with POSIX separators. */
export const WorkspaceFilesListResult = struct({
  files: array(z.string()),
});

export type WorkspaceFilesListPayload = z.infer<typeof WorkspaceFilesListPayload>;
export type WorkspaceFilesListResult = z.infer<typeof WorkspaceFilesListResult>;
