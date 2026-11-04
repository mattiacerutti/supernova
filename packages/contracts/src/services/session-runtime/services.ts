import type {Reference} from "@earendil-works/chord";
import {method, remote, str} from "@earendil-works/chord";
import {json, result, sessionHost} from "@supernova/contracts/lib/protocol";
import type {
  CheckpointNavigationError,
  CompactSessionPayload,
  LoadHistoryPayload,
  LoadHistoryResult,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/session-runtime/procedures";
import type {Session} from "@supernova/contracts/services/sessions/schemas";

/** Payloads leave out `sessionId`. The server variant serves `create` only. */
export const ChatService = remote("supernova.chat", {
  version: 2,
  params: {sessionId: str()},
  hostAddress: sessionHost,
  variants: {
    owner: {
      state: {
        session: json<Session>(),
      },
      methods: {
        // Fails when `edge` is no longer on that side of the leaf.
        loadHistory: method(json<Omit<LoadHistoryPayload, "sessionId">>(), result<LoadHistoryResult>()),
        sendMessage: method(json<Omit<SendMessagePayload, "sessionId">>(), result<null>()),
        compact: method(json<Omit<CompactSessionPayload, "sessionId">>(), result<null>()),
        abort: method(undefined, result<null>()),
        undoCheckpoint: method(json<Omit<UndoCheckpointPayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
        redoCheckpoint: method(json<Omit<RedoCheckpointPayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
        revertToMessage: method(json<Omit<RevertToMessagePayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
      },
    },
    server: {
      methods: {
        /** Waits for every publication queued before the call. */
        current: method(undefined, result<Session>()),
        sendMessage: method(json<Omit<SendMessagePayload, "sessionId">>(), result<null>()),
      },
    },
  },
});

export type ChatOwner = Extract<Reference<typeof ChatService>, {readonly variant: "owner"}>;
export type ChatServer = Extract<Reference<typeof ChatService>, {readonly variant: "server"}>;
