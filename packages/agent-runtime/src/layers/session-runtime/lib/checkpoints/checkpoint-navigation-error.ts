import {CheckpointConflictError, CheckpointGenericError} from "@supernova/contracts/session-runtime/procedures";
import type {CheckpointNavigationError} from "@supernova/contracts/session-runtime/procedures";
import {CheckpointConflictError as WorkspaceConflict} from "@supernova/agent-runtime/layers/session-runtime/internal/shadow-repository";

const CONFLICT_MESSAGE = "Restoring this checkpoint would discard changes made after it.";
const FALLBACK_MESSAGE = "Failed to change the session checkpoint.";

/**
 * Classifies anything thrown while navigating checkpoints into its client-facing error.
 *
 * Navigation operations throw ordinary exceptions; this is the single boundary that decides
 * what clients see. Workspace conflicts become `CheckpointConflictError` so the client can
 * confirm and retry with `force`. Everything else becomes a `CheckpointGenericError`.
 */
// TODO: This classifier only exists because the session runtime is Promise-based and Effect starts at the
// service/RPC edge, so rejections arrive untyped. Consider adopting Effect below that edge, which would carry
// typed errors end to end and remove the need to reclassify causes here.
export function asCheckpointNavigationError(cause: unknown): CheckpointNavigationError {
  if (cause instanceof WorkspaceConflict) return new CheckpointConflictError({cause, message: CONFLICT_MESSAGE});
  return new CheckpointGenericError({cause, message: cause instanceof Error && cause.message.length > 0 ? cause.message : FALLBACK_MESSAGE});
}
