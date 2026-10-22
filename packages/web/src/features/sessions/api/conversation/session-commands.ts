import {useRef, useState} from "react";
import type {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import type {ModelReference, Session, SessionWorkspaceSelection, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import {forgetSession, withSessionRuntime} from "@/features/sessions/api/sessions-sync";
import {readSessionView} from "@/features/sessions/hooks/use-session";
import {sessionStatus} from "@/features/sessions/lib/session-view";
import type {SessionOptimism} from "@/features/sessions/stores/sessions-store";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {showToast} from "@/lib/toast";
import {useSettingsStore} from "@/stores/settings-store";
import type {FailureCode} from "@/runtime/runtime-result";
import {runtimeError, unwrap} from "@/runtime/runtime-result";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";
import {useRuntime} from "@/runtime/use-runtime";

interface SendMessageInput {
  readonly sessionId: string;
  readonly contentParts: readonly UserMessageContentPart[];
  readonly modelReference: ModelReference;
}

interface StartSessionInput extends SendMessageInput {
  readonly projectPath: string;
  readonly workspace: SessionWorkspaceSelection;
}

type StartSessionOutcome = {readonly status: "started"} | {readonly status: "failed"; readonly message: string};

/** `lastTurnId` is the last turn the timeline shows once applied; `null` when it shows none. */
type CheckpointNavigation = ({readonly action: "redo" | "undo"} | {readonly action: "revert"; readonly turnId: string}) & {readonly lastTurnId: string | null};

type CheckpointNavigationOutcome =
  | {readonly status: "applied"}
  | {readonly status: "refused"; readonly reason: "conflict" | "uncaptured"}
  | {readonly status: "failed"; readonly code: FailureCode<SessionRuntimeService["undoCheckpoint"]> | undefined; readonly message: string};

const {patchOptimism: patch, setDocument} = useSessionsStore.getState();

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

function emptySession(projectPath: string, sessionId: string): Session {
  return {
    id: sessionId,
    title: "Untitled session",
    forked: false,
    pinned: false,
    projectPath,
    updatedAt: new Date().toISOString(),
    entries: {items: [], remaining: 0, precedingEntryId: null},
    undone: {items: [], remaining: 0, precedingEntryId: null},
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    context: {usedTokens: 0, contextWindow: 0},
  };
}

const isRunning = (sessionId: string): boolean => useSessionsStore.getState().entries[sessionId]?.activity === "running";

function whenNotRunning(sessionId: string, run: () => void): void {
  if (!isRunning(sessionId)) return run();
  const stop = useSessionsStore.subscribe(() => {
    if (isRunning(sessionId)) return;
    stop();
    run();
  });
}

function navigate(sessionRuntime: SessionRuntimeService, navigation: CheckpointNavigation, force: boolean) {
  if (navigation.action === "revert") return sessionRuntime.revertToMessage({force, turnId: navigation.turnId});
  if (navigation.action === "redo") return sessionRuntime.redoCheckpoint({force});
  return sessionRuntime.undoCheckpoint({force});
}

export function sessionActions(runtime: RuntimeClient) {
  const status = (sessionId: string) => {
    const {documents, entries, optimism} = useSessionsStore.getState();
    return sessionStatus(entries[sessionId], optimism[sessionId], documents[sessionId]).status;
  };

  const begin = (sessionId: string, optimism: SessionOptimism): void => patch(sessionId, {error: undefined, ...optimism});

  const fail = (sessionId: string, cause: unknown, fallback: string): void => patch(sessionId, {error: errorMessage(cause, fallback)});

  const pendingMessage = (input: SendMessageInput) => ({id: `msg_${crypto.randomUUID()}`, contentParts: input.contentParts, timestamp: new Date().toISOString()});

  const outgoingMessage = (input: SendMessageInput) => ({
    captureCheckpoints: useSettingsStore.getState().captureCheckpoints,
    contentParts: [...input.contentParts],
    modelReference: input.modelReference,
  });

  return {
    sendMessage(input: SendMessageInput): void {
      const {sessionId} = input;
      if (status(sessionId) !== "idle") return;
      begin(sessionId, {message: pendingMessage(input)});
      void withSessionRuntime(runtime, sessionId, (service) => unwrap(service.sendMessage(outgoingMessage(input))))
        .catch((cause: unknown) => fail(sessionId, cause, "Failed to send message."))
        .finally(() => patch(sessionId, {message: undefined}));
    },

    async startSession(input: StartSessionInput): Promise<StartSessionOutcome> {
      const {projectPath, sessionId, workspace} = input;
      setDocument(emptySession(projectPath, sessionId));
      // Worktree creation starts before the runtime can report it; showing it now keeps the thinking label from flashing first.
      begin(sessionId, {message: pendingMessage(input), setupStep: workspace.mode === "worktree" ? "worktree" : undefined});
      try {
        setDocument(await unwrap(runtime.sessions.create({id: sessionId, message: outgoingMessage(input), projectPath, workspace})));
        patch(sessionId, {message: undefined, setupStep: undefined});
        return {status: "started"};
      } catch (cause) {
        forgetSession(sessionId);
        return {status: "failed", message: errorMessage(cause, "Failed to start the session.")};
      }
    },

    abortSession(sessionId: string): void {
      if (status(sessionId) !== "streaming") return;
      patch(sessionId, {stopping: true});
      const settle = () => patch(sessionId, {stopping: undefined});
      void withSessionRuntime(runtime, sessionId, (service) => service.abort(null)).then((result) => (result.ok ? whenNotRunning(sessionId, settle) : settle()), settle);
    },

    compactSession(input: {readonly sessionId: string; readonly modelReference: ModelReference}): void {
      const {modelReference, sessionId} = input;
      if (status(sessionId) !== "idle") return;
      begin(sessionId, {compacting: true});
      void withSessionRuntime(runtime, sessionId, (service) => unwrap(service.compact({modelReference})))
        .catch((cause: unknown) => fail(sessionId, cause, "Failed to compact session."))
        .finally(() => patch(sessionId, {compacting: undefined}));
    },

    async navigateCheckpoint(input: CheckpointNavigation & {readonly sessionId: string; readonly force?: boolean}): Promise<CheckpointNavigationOutcome> {
      const {force = false, sessionId} = input;
      const current = status(sessionId);
      // Only a forced retry may start while a refused restore holds the timeline.
      if (current !== "idle" && !(force && current === "checkpoint-navigating")) return {status: "failed", code: undefined, message: "The session is busy."};
      begin(sessionId, {navigation: {lastTurnId: input.lastTurnId}});
      try {
        await withSessionRuntime(runtime, sessionId, (service) => unwrap(navigate(service, input, force)));
        patch(sessionId, {navigation: undefined});
        return {status: "applied"};
      } catch (cause) {
        const code = runtimeError<SessionRuntimeService["undoCheckpoint"]>(cause)?.code;
        if (!force && code === "CheckpointConflictError") return {status: "refused", reason: "conflict"};
        if (!force && code === "CheckpointUncapturedError") return {status: "refused", reason: "uncaptured"};
        patch(sessionId, {navigation: undefined});
        return {status: "failed", code, message: errorMessage(cause, "The session checkpoint could not be changed.")};
      }
    },

    cancelNavigation(sessionId: string): void {
      patch(sessionId, {navigation: undefined});
    },
  };
}

const NAVIGATION_FAILURE_TITLES: Readonly<Record<CheckpointNavigation["action"], string>> = {
  redo: "Unable to redo checkpoint",
  revert: "Unable to revert message",
  undo: "Unable to undo checkpoint",
};

interface UseSessionCommandsOptions {
  readonly sessionId: string;
  readonly modelReference: ModelReference | undefined;
}

/** A refused restore keeps the timeline moved until the user confirms (forced retry) or cancels. */
export function useSessionCommands(options: UseSessionCommandsOptions) {
  const {modelReference, sessionId} = options;
  const actions = sessionActions(useRuntime());
  const [confirmation, setConfirmation] = useState<{readonly open: boolean; readonly reason: "conflict" | "uncaptured"}>({open: false, reason: "conflict"});
  const refused = useRef<CheckpointNavigation | null>(null);
  const mounted = useRef(true);

  const release = (): void => {
    if (!refused.current) return;
    refused.current = null;
    actions.cancelNavigation(sessionId);
  };

  useMountEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      release();
    };
  });

  const navigate = async (navigation: CheckpointNavigation, force = false): Promise<void> => {
    const outcome = await actions.navigateCheckpoint({...navigation, force, sessionId});
    if (outcome.status === "applied") return;
    if (outcome.status === "failed") {
      if (outcome.code === "CheckpointInheritedError") {
        showToast("Nothing to undo in this fork", "This message came from the session this one was forked from. Only messages sent in this session can be undone.", {sessionId});
      } else showToast(NAVIGATION_FAILURE_TITLES[navigation.action], outcome.message, {sessionId, type: "error"});
      return;
    }
    refused.current = navigation;
    if (!mounted.current) release();
    else if (useSettingsStore.getState().confirmCheckpointConflicts) setConfirmation({open: true, reason: outcome.reason});
    else await retryRefused();
  };

  const retryRefused = async (): Promise<void> => {
    const navigation = refused.current;
    refused.current = null;
    if (navigation) await navigate(navigation, true);
  };

  const closeConfirmation = (): void => setConfirmation((current) => ({...current, open: false}));

  // Navigation targets are read when the command runs, so the commands keep their identity while a response streams.
  return {
    startSession: (input: Omit<StartSessionInput, "sessionId">): Promise<StartSessionOutcome> => actions.startSession({...input, sessionId}),
    sendMessage: (contentParts: readonly UserMessageContentPart[]): void => {
      if (modelReference) actions.sendMessage({contentParts, modelReference, sessionId});
    },
    stop: (): void => actions.abortSession(sessionId),
    compact: (): void => {
      if (modelReference) actions.compactSession({modelReference, sessionId});
    },
    undo: (): void => void navigate({action: "undo", lastTurnId: readSessionView(sessionId).turns.at(-2)?.id ?? null}),
    redo: (): void => {
      const {turns, undoneTurns} = readSessionView(sessionId);
      void navigate({action: "redo", lastTurnId: undoneTurns[0]?.id ?? turns.at(-1)?.id ?? null});
    },
    revertToMessage: (turnId: string): void => {
      const {turns} = readSessionView(sessionId);
      const shownIndex = turns.findIndex((turn) => turn.id === turnId);
      const lastTurnId = shownIndex >= 0 ? (turns[shownIndex - 1]?.id ?? null) : turnId;
      void navigate({action: "revert", lastTurnId, turnId});
    },
    checkpointConflict: {
      open: confirmation.open,
      reason: confirmation.reason,
      confirm: (): void => {
        void retryRefused();
        closeConfirmation();
      },
      cancel: (): void => {
        release();
        closeConfirmation();
      },
    },
  };
}
