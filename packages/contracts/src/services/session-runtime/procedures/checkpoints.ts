import {z} from "zod";
import type {ErrorOf} from "@supernova/contracts/lib/errors";
import {errorUnion, TaggedError} from "@supernova/contracts/lib/errors";

/** Shared fields for every checkpoint navigation command. */
const CheckpointNavigationFields = {
  /** Allows discarding conflicting or uncaptured workspace changes. */
  force: z.boolean().optional(),
  sessionId: z.string(),
};

export const RevertToMessagePayload = z.object({
  ...CheckpointNavigationFields,
  turnId: z.string(),
});

export const UndoCheckpointPayload = z.object(CheckpointNavigationFields);

export const RedoCheckpointPayload = z.object(CheckpointNavigationFields);

/** Raised when restoring would discard workspace changes made after the current checkpoint. Retry with `force` to discard them. */
export class CheckpointConflictError extends TaggedError("CheckpointConflictError") {}

/** Raised when the current boundary has no workspace snapshot. Retry with `force` to restore the captured target. */
export class CheckpointUncapturedError extends TaggedError("CheckpointUncapturedError") {}

/** Raised when the target was copied in by a fork, whose workspace snapshots belong to the session it forked from. */
export class CheckpointInheritedError extends TaggedError("CheckpointInheritedError") {}

/** Why checkpoint navigation was refused; anything else is a `GenericError`. */
export const CheckpointNavigationError = errorUnion(CheckpointConflictError, CheckpointInheritedError, CheckpointUncapturedError);

export type CheckpointNavigationError = ErrorOf<typeof CheckpointNavigationError>;
export type RevertToMessagePayload = z.infer<typeof RevertToMessagePayload>;
export type UndoCheckpointPayload = z.infer<typeof UndoCheckpointPayload>;
export type RedoCheckpointPayload = z.infer<typeof RedoCheckpointPayload>;
