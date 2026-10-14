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

/**
 * One running session, addressed by its id: a client holds it for as long as it follows the session. The input names
 * the session, so payloads leave out `sessionId`. Holding an unknown session fails.
 */
export const SessionRuntimeService = remote("supernova.session-runtime", {
  version: 1,
  input: Type.Object({sessionId: Type.String()}),
  variants: {
    default: {
      state: {
        /** The session's document: Pi's entries and documents plus what Supernova adds. */
        session: json<Session>(),
      },
      methods: {
        /**
         * A page of the branch beyond the document's window, on the side named: shown turns before `edge`, or undone
         * turns after it. Fails when `edge` is no longer on that side of the leaf.
         */
        loadHistory: method(json<Omit<LoadHistoryPayload, "sessionId">>(), result<LoadHistoryResult>()),
        /** Starts a turn; resolves once the engine placed the input. */
        sendMessage: method(json<Omit<SendMessagePayload, "sessionId">>(), result<null>()),
        compact: method(json<Omit<CompactSessionPayload, "sessionId">>(), result<null>()),
        /** Stops the session's preparation, run, and queued inputs. */
        abort: method(NO_PAYLOAD, result<null>()),
        undoCheckpoint: method(json<Omit<UndoCheckpointPayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
        redoCheckpoint: method(json<Omit<RedoCheckpointPayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
        revertToMessage: method(json<Omit<RevertToMessagePayload, "sessionId">>(), result<null, CheckpointNavigationError>()),
      },
    },
  },
});

export type SessionRuntimeService = MembersOf<typeof SessionRuntimeService>;
