import {CheckpointConflictError, CheckpointGenericError, CheckpointUncapturedError} from "@supernova/contracts/session-runtime/procedures";
import type {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointConflictError as WorkspaceConflict} from "@supernova/agent-runtime/features/session-runtime/checkpoints/shadow-repository";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";

/**
 * Checkpoint navigation throws plain errors from deep inside git handling; this decides what the client sees.
 * Workspace conflicts become `CheckpointConflictError` so the client can confirm and retry with `force`.
 */
export function toCheckpointNavigationError(cause: unknown): CheckpointNavigationError {
  if (cause instanceof CheckpointUncapturedError || cause instanceof CheckpointConflictError || cause instanceof CheckpointGenericError) return cause;
  if (cause instanceof WorkspaceConflict) return new CheckpointConflictError({cause, message: "Restoring this checkpoint would discard changes made after it."});
  return new CheckpointGenericError({cause, message: errorMessage(cause, "Failed to change the session checkpoint.")});
}
