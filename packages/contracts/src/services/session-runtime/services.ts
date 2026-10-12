import type {Context, ReplicatedState} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import type {
  CheckpointNavigationError,
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";

/**
 * The running session a connection attached (`SessionsService.attach`). The attachment names the session, so payloads
 * leave out `sessionId`.
 */
export interface SessionRuntimeService {
  /** The session's document: Pi's entries and documents plus what Supernova adds. */
  readonly session: ReplicatedState<Session>;
  /** Starts a turn; resolves once the engine placed the input. */
  sendMessage(payload: Omit<SendMessagePayload, "sessionId">, context: Context): Promise<ServiceResult<null>>;
  compact(payload: Omit<CompactSessionPayload, "sessionId">, context: Context): Promise<ServiceResult<null>>;
  /** Stops the session's preparation, run, and queued inputs. */
  abort(context: Context): Promise<ServiceResult<null>>;
  undoCheckpoint(payload: Omit<UndoCheckpointPayload, "sessionId">, context: Context): Promise<ServiceResult<null, CheckpointNavigationError>>;
  redoCheckpoint(payload: Omit<RedoCheckpointPayload, "sessionId">, context: Context): Promise<ServiceResult<null, CheckpointNavigationError>>;
  revertToMessage(payload: Omit<RevertToMessagePayload, "sessionId">, context: Context): Promise<ServiceResult<null, CheckpointNavigationError>>;
}

export const SessionRuntimeService = defineService<SessionRuntimeService>("supernova.session-runtime");
