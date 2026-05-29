import {Context, Effect} from "effect";
import type {Stream} from "effect";
import type {
  CompactSessionPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  SessionStreamEvent,
  UndoCheckpointPayload,
} from "@supernova/contracts/session-runtime/procedures";

export interface SessionRuntimeServiceShape {
  readonly abortSession: (sessionId: string) => Effect.Effect<void>;
  readonly compactSession: (input: CompactSessionPayload) => Effect.Effect<void>;
  readonly redoCheckpoint: (input: RedoCheckpointPayload) => Effect.Effect<void>;
  readonly revertToMessage: (input: RevertToMessagePayload) => Effect.Effect<void>;
  readonly sendMessage: (input: SendMessagePayload) => Effect.Effect<void>;
  readonly undoCheckpoint: (input: UndoCheckpointPayload) => Effect.Effect<void>;
  readonly watchEvents: () => Stream.Stream<SessionStreamEvent>;
}

/** Owns long-lived agent session runtimes and their observable event stream. */
export class SessionRuntimeService extends Context.Service<SessionRuntimeService, SessionRuntimeServiceShape>()("supernova/agent-runtime/SessionRuntimeService") {}
