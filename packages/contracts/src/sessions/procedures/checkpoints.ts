import {Schema} from "effect";

export const RevertToMessagePayload = Schema.Struct({
  sessionId: Schema.String,
  turnId: Schema.String,
});

export const UndoCheckpointPayload = Schema.Struct({
  sessionId: Schema.String,
});

export const RedoCheckpointPayload = Schema.Struct({
  sessionId: Schema.String,
});

export type RevertToMessagePayload = typeof RevertToMessagePayload.Type;
export type UndoCheckpointPayload = typeof UndoCheckpointPayload.Type;
export type RedoCheckpointPayload = typeof RedoCheckpointPayload.Type;
