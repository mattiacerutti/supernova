import {Schema} from "effect";

/** Shared fields for every checkpoint navigation command. */
const CheckpointNavigationFields = {
  /** Discards conflicting manual changes instead of refusing to restore. */
  force: Schema.optional(Schema.Boolean),
  sessionId: Schema.String,
};

export const RevertToMessagePayload = Schema.Struct({
  ...CheckpointNavigationFields,
  turnId: Schema.String,
});

export const UndoCheckpointPayload = Schema.Struct(CheckpointNavigationFields);

export const RedoCheckpointPayload = Schema.Struct(CheckpointNavigationFields);

/** Navigation failure with no actionable detail, reported for every cause except a workspace conflict. */
export class CheckpointGenericError extends Schema.TaggedErrorClass<CheckpointGenericError>()("CheckpointGenericError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

/** Raised when restoring would discard workspace changes made after the current checkpoint. Retry with `force` to discard them. */
export class CheckpointConflictError extends Schema.TaggedErrorClass<CheckpointConflictError>()("CheckpointConflictError", {
  cause: Schema.optional(Schema.Defect),
  message: Schema.String,
}) {}

export const CheckpointNavigationError = Schema.Union([CheckpointGenericError, CheckpointConflictError]);

export type CheckpointNavigationError = typeof CheckpointNavigationError.Type;
export type RevertToMessagePayload = typeof RevertToMessagePayload.Type;
export type UndoCheckpointPayload = typeof UndoCheckpointPayload.Type;
export type RedoCheckpointPayload = typeof RedoCheckpointPayload.Type;
