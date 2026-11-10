import {bool, obj, opt, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const ArchiveSessionPayload = obj({
  projectPath: str(),
  sessionId: str(),
  /** Also removes the session's worktree and branch. */
  removeWorktree: opt(bool()),
});

export const ArchiveSessionResult = obj({
  projectPath: str(),
  sessionId: str(),
});

export class ArchiveSessionError extends TaggedError("ArchiveSessionError") {}

export type ArchiveSessionPayload = Static<typeof ArchiveSessionPayload>;
export type ArchiveSessionResult = Static<typeof ArchiveSessionResult>;
