import {z} from "zod";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const ArchiveSessionPayload = z.object({
  projectPath: z.string(),
  sessionId: z.string(),
  /** Also remove the session's worktree and branch. Ignored for sessions without a worktree. */
  removeWorktree: z.boolean().optional(),
});

export const ArchiveSessionResult = z.object({
  projectPath: z.string(),
  sessionId: z.string(),
});

export class ArchiveSessionError extends TaggedError("ArchiveSessionError") {}

export type ArchiveSessionPayload = z.infer<typeof ArchiveSessionPayload>;
export type ArchiveSessionResult = z.infer<typeof ArchiveSessionResult>;
