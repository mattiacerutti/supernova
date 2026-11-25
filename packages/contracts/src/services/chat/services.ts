import type {Reference} from "@earendil-works/chord";
import {method, nul, remote, str} from "@earendil-works/chord";
import type {Errors} from "@supernova/contracts/lib/errors";
import {json, sessionHost} from "@supernova/contracts/lib/protocol";
import type {LoadHistoryResult} from "@supernova/contracts/services/chat/procedures";
import {CheckpointNavigationError} from "@supernova/contracts/services/chat/procedures";
import {
  CompactSessionPayload,
  ForkSeed,
  ForkSeedPayload,
  LoadHistoryPayload,
  RedoCheckpointPayload,
  RevertToMessagePayload,
  SendMessagePayload,
  UndoCheckpointPayload,
} from "@supernova/contracts/services/chat/procedures";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";

export const ChatService = remote("supernova.chat", {
  version: 8,
  params: {sessionId: str()},
  hostAddress: sessionHost,
  variants: {
    owner: {
      state: {
        document: json<ChatDocument>(),
      },
      methods: {
        loadHistory: method(LoadHistoryPayload, json<LoadHistoryResult>()),
        sendMessage: method(SendMessagePayload, nul()),
        compact: method(CompactSessionPayload, nul()),
        abort: method(undefined, nul()),
        undoCheckpoint: method(UndoCheckpointPayload, nul()),
        redoCheckpoint: method(RedoCheckpointPayload, nul()),
        revertToMessage: method(RevertToMessagePayload, nul()),
      },
    },
    server: {
      methods: {
        sendMessage: method(SendMessagePayload, nul()),
        forkSeed: method(ForkSeedPayload, json<ForkSeed>()),
        seed: method(ForkSeed, nul()),
        reload: method(undefined, nul()),
        abort: method(undefined, nul()),
      },
    },
  },
});

export const ChatErrors = {
  undoCheckpoint: CheckpointNavigationError,
  redoCheckpoint: CheckpointNavigationError,
  revertToMessage: CheckpointNavigationError,
} satisfies Errors<typeof ChatService>;

export type ChatOwner = Extract<Reference<typeof ChatService>, {readonly variant: "owner"}>;
export type ChatServer = Extract<Reference<typeof ChatService>, {readonly variant: "server"}>;
