import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";

/** Shared fields for every checkpoint navigation command. */
const CheckpointNavigationFields = {
  /** Allows discarding conflicting or uncaptured workspace changes. */
  force: z.boolean().optional(),
  sessionId: z.string(),
};

export const RevertToMessagePayload = struct({
  ...CheckpointNavigationFields,
  turnId: z.string(),
});

export const UndoCheckpointPayload = struct(CheckpointNavigationFields);

export const RedoCheckpointPayload = struct(CheckpointNavigationFields);

/** Navigation failure with no actionable detail, reported for every cause except a workspace conflict. */
export class CheckpointGenericError extends TaggedError("CheckpointGenericError") {}

/** Raised when restoring would discard workspace changes made after the current checkpoint. Retry with `force` to discard them. */
export class CheckpointConflictError extends TaggedError("CheckpointConflictError") {}

/** Raised when the current boundary has no workspace snapshot. Retry with `force` to restore the captured target. */
export class CheckpointUncapturedError extends TaggedError("CheckpointUncapturedError") {}

/** Raised when the target was copied in by a fork, whose workspace snapshots belong to the session it forked from. */
export class CheckpointInheritedError extends TaggedError("CheckpointInheritedError") {}

export type CheckpointNavigationError = CheckpointGenericError | CheckpointConflictError | CheckpointInheritedError | CheckpointUncapturedError;
export type RevertToMessagePayload = z.infer<typeof RevertToMessagePayload>;
export type UndoCheckpointPayload = z.infer<typeof UndoCheckpointPayload>;
export type RedoCheckpointPayload = z.infer<typeof RedoCheckpointPayload>;
