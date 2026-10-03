import {z} from "zod";

export const WorkspaceFilesListPayload = z.object({
  projectPath: z.string(),
});

/** Tracked and untracked-but-not-ignored files of every discovered repository, project-relative with POSIX separators. */
export const WorkspaceFilesListResult = z.object({
  files: z.array(z.string()),
});

export type WorkspaceFilesListPayload = z.infer<typeof WorkspaceFilesListPayload>;
export type WorkspaceFilesListResult = z.infer<typeof WorkspaceFilesListResult>;
