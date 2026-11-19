import {bool, obj, opt, type Static, str} from "@earendil-works/chord";
import {errorUnion, TaggedError} from "@supernova/contracts/lib/errors";

const CheckpointNavigationFields = {
  /** Discards conflicting or uncaptured workspace changes. */
  force: opt(bool()),
};

export const RevertToMessagePayload = obj({
  ...CheckpointNavigationFields,
  turnId: str(),
});

export const UndoCheckpointPayload = obj(CheckpointNavigationFields);

export const RedoCheckpointPayload = obj(CheckpointNavigationFields);

export class CheckpointConflictError extends TaggedError("CheckpointConflictError") {}

export class CheckpointUncapturedError extends TaggedError("CheckpointUncapturedError") {}

/** The target was copied in by a fork, whose snapshots belong to its source. */
export class CheckpointInheritedError extends TaggedError("CheckpointInheritedError") {}

export const CheckpointNavigationError = errorUnion(CheckpointConflictError, CheckpointInheritedError, CheckpointUncapturedError);

export type RevertToMessagePayload = Static<typeof RevertToMessagePayload>;
export type UndoCheckpointPayload = Static<typeof UndoCheckpointPayload>;
export type RedoCheckpointPayload = Static<typeof RedoCheckpointPayload>;
