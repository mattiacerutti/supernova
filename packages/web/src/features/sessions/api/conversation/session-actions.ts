import type {ModelReference, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useQueryClient} from "@tanstack/react-query";
import type {CheckpointNavigationOutcome, StartSessionOutcome} from "@/features/sessions/stores/conversation/session-live-store";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {useRpcClient} from "@/rpc/use-rpc-client";

interface SendMessageInput {
  readonly contentParts: readonly UserMessageContentPart[];
  readonly modelReference: ModelReference;
  readonly sessionId: string;
}

interface StartSessionInput extends SendMessageInput {
  readonly projectPath: string;
}

interface CompactSessionInput {
  readonly modelReference: ModelReference;
  readonly sessionId: string;
}

interface CheckpointNavigationInput {
  readonly sessionId: string;
}

interface RevertToMessageInput extends CheckpointNavigationInput {
  readonly turnId: string;
}

export interface SessionActions {
  readonly abortSession: (input: CheckpointNavigationInput) => void;
  readonly compactSession: (input: CompactSessionInput) => void;
  readonly redoCheckpoint: (input: CheckpointNavigationInput) => Promise<CheckpointNavigationOutcome>;
  readonly revertToMessage: (input: RevertToMessageInput) => Promise<CheckpointNavigationOutcome>;
  readonly sendMessage: (input: SendMessageInput) => void;
  /** Creates a session under a client-chosen id with its first message; see `StartSessionOutcome`. */
  readonly startSession: (input: StartSessionInput) => Promise<StartSessionOutcome>;
  readonly undoCheckpoint: (input: CheckpointNavigationInput) => Promise<CheckpointNavigationOutcome>;
}

/**
 * Live-session actions with the transport and query cache already bound. The live store owns the
 * optimistic state machine and takes both as parameters; this is the only place components meet it.
 */
export function useSessionActions(): SessionActions {
  const queryClient = useQueryClient();
  const rpcClient = useRpcClient();
  const abortSession = useSessionLiveStore((state) => state.abortSession);
  const compactSession = useSessionLiveStore((state) => state.compactSession);
  const redoCheckpoint = useSessionLiveStore((state) => state.redoCheckpoint);
  const revertToMessage = useSessionLiveStore((state) => state.revertToMessage);
  const sendMessage = useSessionLiveStore((state) => state.sendMessage);
  const startSession = useSessionLiveStore((state) => state.startSession);
  const undoCheckpoint = useSessionLiveStore((state) => state.undoCheckpoint);

  return {
    abortSession: (input) => abortSession({...input, rpcClient}),
    compactSession: (input) => compactSession({...input, rpcClient}),
    redoCheckpoint: (input) => redoCheckpoint({...input, queryClient, rpcClient}),
    revertToMessage: (input) => revertToMessage({...input, queryClient, rpcClient}),
    sendMessage: (input) => sendMessage({...input, queryClient, rpcClient}),
    startSession: (input) => startSession({...input, queryClient, rpcClient}),
    undoCheckpoint: (input) => undoCheckpoint({...input, queryClient, rpcClient}),
  };
}
