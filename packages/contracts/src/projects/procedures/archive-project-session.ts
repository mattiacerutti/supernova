import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";

export const ProjectSessionArchivePayload = struct({
  projectPath: z.string(),
  sessionId: z.string(),
  /** Also remove the session's worktree and branch. Ignored for sessions without a worktree. */
  removeWorktree: z.boolean().optional(),
});

export const ProjectSessionArchiveResult = struct({
  projectPath: z.string(),
  sessionId: z.string(),
});

export class ProjectSessionArchiveError extends TaggedError("ProjectSessionArchiveError") {}

export type ProjectSessionArchivePayload = z.infer<typeof ProjectSessionArchivePayload>;
export type ProjectSessionArchiveResult = z.infer<typeof ProjectSessionArchiveResult>;
