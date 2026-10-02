import type {SessionSetupStep} from "@supernova/contracts/session-runtime/procedures";
import type {ModelReference, Session, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useMemo, useRef, useState} from "react";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/rows/build-session-timeline";
import {buildSessionTurns} from "@/features/sessions/lib/timeline/turns/build-turns";
import type {ClientSlashCommandActions} from "@/features/sessions/lib/composer/editor/client-slash-commands";
import {useSettingsStore} from "@/stores/settings-store";
import {useSessionActions} from "@/features/sessions/api/conversation/session-actions";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import type {CheckpointNavigationConfirmation, CheckpointNavigationOutcome, PendingMessage, SessionLiveStatus} from "@/features/sessions/stores/conversation/session-live-store";
import type {SessionTimelineItem} from "@/features/sessions/types/session-timeline-item";
import type {SessionTurn} from "@/features/sessions/types/session-turn";
import {useMountEffect} from "@/hooks/use-mount-effect";

interface UseSessionTimelineResult {
  /** Pending confirmation for a restore that would discard manual workspace changes. */
  readonly checkpointConflict: {readonly cancel: () => void; readonly confirm: () => void; readonly open: boolean; readonly reason: "conflict" | "uncaptured"};
  readonly committedTimelineItems: readonly SessionTimelineItem[];
  readonly liveTimelineItems: readonly SessionTimelineItem[];
  /** Visible turns, with an optimistic navigation applied. */
  readonly turns: readonly SessionTurn[];
  /** Turns hidden behind undo, with an optimistic navigation applied. */
  readonly undoneTurns: readonly SessionTurn[];
  /** Setup step running before a new session's first turn. */
  readonly setupStep: SessionSetupStep | null;
  readonly slashCommandActions: ClientSlashCommandActions;
  readonly stopStreaming: () => void;
  readonly streamError: string | null;
  readonly streamStatus: SessionLiveStatus;
  readonly revertToMessage: (turnId: string) => void;
  readonly submitMessage: (contentParts: readonly UserMessageContentPart[]) => void;
}

interface UseSessionTimelineOptions {
  readonly sessionId: string;
  readonly session: Session | undefined;
  readonly modelReference: ModelReference | undefined;
}

/** A message sent but not in the session's state yet, as the start of the live turn. */
function pendingTurn(pending: PendingMessage): SessionTurn {
  const userMessage = {contentParts: pending.contentParts, id: pending.id, timestamp: pending.timestamp};
  return {completedAt: undefined, events: [], id: pending.id, startedAt: pending.timestamp, status: "streaming", userMessage};
}

/** Applies the chat side of an undo, redo, or revert to `turnId` before the server confirms it. */
function navigated(turns: readonly SessionTurn[], undoneTurns: readonly SessionTurn[], turnId: string | null) {
  const undoneIndex = turnId === null ? -1 : undoneTurns.findIndex((turn) => turn.id === turnId);
  if (undoneIndex >= 0) return {turns: [...turns, ...undoneTurns.slice(0, undoneIndex + 1)], undoneTurns: undoneTurns.slice(undoneIndex + 1)};
  const turnIndex = turnId === null ? -1 : turns.findIndex((turn) => turn.id === turnId);
  if (turnIndex >= 0) return {turns: turns.slice(0, turnIndex), undoneTurns: [...turns.slice(turnIndex), ...undoneTurns]};
  return {turns, undoneTurns};
}

export function useSessionTimeline(options: UseSessionTimelineOptions): UseSessionTimelineResult {
  const {modelReference, session, sessionId} = options;
  const [confirmation, setConfirmation] = useState<{readonly open: boolean; readonly reason: "conflict" | "uncaptured"}>({open: false, reason: "conflict"});
  const pendingConfirmation = useRef<CheckpointNavigationConfirmation | null>(null);
  const mounted = useRef(true);

  useMountEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingConfirmation.current?.cancel();
      pendingConfirmation.current = null;
    };
  });

  /** Keeps the optimistic timeline until the user decides, or retries immediately when confirmation is off. */
  const navigate = async (run: () => Promise<CheckpointNavigationOutcome>): Promise<void> => {
    const outcome = await run();
    if (typeof outcome === "string") return;
    if (!mounted.current) {
      outcome.cancel();
      return;
    }
    if (useSettingsStore.getState().confirmCheckpointConflicts) {
      pendingConfirmation.current = outcome;
      setConfirmation({open: true, reason: outcome.reason});
    } else await outcome.confirm();
  };

  const sessionState = useSessionLiveStore((state) => state.sessions[sessionId]);
  const actions = useSessionActions();

  const streamStatus = sessionState?.status ?? "idle";
  const projected = useMemo(() => (session ? buildSessionTurns(session) : undefined), [session]);
  const undoneProjection = useMemo(() => (session ? buildSessionTurns({entries: session.undone, live: {}, turns: session.turns}).turns : []), [session]);
  const {turns, undoneTurns} = navigated(projected?.turns ?? [], undoneProjection, sessionState?.navigationTurnId ?? null);
  const pending = sessionState?.pending;
  const streamTurn = projected?.liveTurn ?? (pending ? pendingTurn(pending) : null);
  const committedTimelineItems = useMemo(() => buildCommittedTimelineItems(turns), [turns]);

  const liveTimelineItems = useMemo(
    () => buildLiveTimelineItems({live: streamStatus === "streaming" || streamStatus === "compacting", liveTurn: streamTurn}),
    [streamStatus, streamTurn]
  );

  const submitMessage = (contentParts: readonly UserMessageContentPart[]): void => {
    if (streamStatus !== "idle") return;

    if (!modelReference) {
      // The composer should already be disabled, but keeping this guard prevents
      // callers from starting an invalid stream from routes that load models later.
      return;
    }

    actions.sendMessage({contentParts, modelReference, sessionId});
  };

  const stopStreaming = (): void => {
    actions.abortSession({sessionId});
  };

  const triggerCompaction = (): void => {
    if (streamStatus !== "idle" || !modelReference) return;

    actions.compactSession({modelReference, sessionId});
  };

  const undo = (): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => actions.undoCheckpoint({firstUndoneTurnId: undoneTurns[0]?.id, lastTurnId: turns.at(-1)?.id, sessionId}));
  };

  const redo = (): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => actions.redoCheckpoint({firstUndoneTurnId: undoneTurns[0]?.id, lastTurnId: turns.at(-1)?.id, sessionId}));
  };

  const revertToMessage = (turnId: string): void => {
    if (streamStatus !== "idle") return;

    void navigate(() => actions.revertToMessage({sessionId, turnId}));
  };

  return {
    checkpointConflict: {
      cancel: () => {
        pendingConfirmation.current?.cancel();
        pendingConfirmation.current = null;
        setConfirmation((current) => ({...current, open: false}));
      },
      confirm: () => {
        void pendingConfirmation.current?.confirm();
        pendingConfirmation.current = null;
        setConfirmation((current) => ({...current, open: false}));
      },
      open: confirmation.open,
      reason: confirmation.reason,
    },
    setupStep: sessionState?.setupStep ?? null,
    streamStatus,
    streamError: sessionState?.error ?? null,
    turns,
    undoneTurns,
    committedTimelineItems,
    liveTimelineItems,
    slashCommandActions: {compact: triggerCompaction, redo, undo},
    revertToMessage,
    submitMessage,
    stopStreaming,
  };
}
