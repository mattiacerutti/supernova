import type {MembersOf} from "@earendil-works/chord";
import {method, remote} from "@earendil-works/chord";
import {Type} from "typebox";
import {json, NO_PAYLOAD, result} from "@supernova/contracts/lib/protocol";
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

/** One object per session; holding an unknown session fails. Payloads leave out `sessionId`. */
export const SessionRuntimeService = remote("supernova.session-runtime", {
  version: 1,
  input: Type.Object({sessionId: Type.String()}),
  variants: {
    default: {
      state: {
        session: json<Session>(),
      },
      methods: {
        // Fails when `edge` is no longer on that side of the leaf.
        loadHistory: method(json<Omit<LoadHistoryPayload, "sessionId">>(), result<LoadHistoryResult>()),
        sendMessage: method(json<Omit<SendMessagePayload, "sessionId">>(), result<null>()),
        compact: method(json<Omit<CompactSessionPayload, "sessionId">>(), result<null>()),
        abort: method(NO_PAYLOAD, result<null>()),
        undoCheckpoint: method(json<Omit<UndoCheckpointPayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
        redoCheckpoint: method(json<Omit<RedoCheckpointPayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
        revertToMessage: method(json<Omit<RevertToMessagePayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
      },
    },
  },
});

export type SessionRuntimeService = MembersOf<typeof SessionRuntimeService>;
