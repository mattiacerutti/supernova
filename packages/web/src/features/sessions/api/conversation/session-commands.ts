import {BACKGROUND_CONTEXT} from "@earendil-works/chord/context";
import {useRef, useState} from "react";
import type {SessionRuntimeService} from "@supernova/contracts/services/session-runtime/services";
import type {ModelReference, Session, SessionWorkspaceSelection, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import {attachSession, forgetSession} from "@/features/sessions/api/sessions-sync";
import type {SessionView} from "@/features/sessions/lib/session-view";
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

/** Whether the runtime created the session and accepted its first turn. On failure nothing of the session remains here. */
export type StartSessionOutcome = {readonly status: "started"} | {readonly status: "failed"; readonly message: string};

/** An undo, redo, or revert; `turnId` is the turn the timeline moves to, and the revert's target. */
export type CheckpointNavigation = {readonly action: "redo" | "undo"; readonly turnId: string | undefined} | {readonly action: "revert"; readonly turnId: string};

export type CheckpointNavigationOutcome =
  | {readonly status: "applied"}
  | {readonly status: "refused"; readonly reason: "conflict" | "uncaptured"}
  | {readonly status: "failed"; readonly code: FailureCode<SessionRuntimeService["undoCheckpoint"]> | undefined; readonly message: string};

const {patchOptimism: patch, setDocument} = useSessionsStore.getState();

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

/** The session the runtime will create for a first message, shown until its document arrives. */
function emptySession(projectPath: string, sessionId: string): Session {
  return {
    id: sessionId,
    title: "Untitled session",
    forked: false,
    projectPath,
    updatedAt: new Date().toISOString(),
    entries: [],
    undone: [],
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    turns: {},
    context: {usedTokens: 0, contextWindow: 0},
  };
}

const isRunning = (sessionId: string): boolean => useSessionsStore.getState().entries[sessionId]?.activity === "running";

/** Runs `run` once the runtime no longer reports the session running. */
function whenNotRunning(sessionId: string, run: () => void): void {
  if (!isRunning(sessionId)) return run();
  const stop = useSessionsStore.subscribe(() => {
    if (isRunning(sessionId)) return;
    stop();
    run();
  });
}

function navigate(sessionRuntime: SessionRuntimeService, navigation: CheckpointNavigation, force: boolean) {
  if (navigation.action === "revert") return sessionRuntime.revertToMessage({force, turnId: navigation.turnId}, BACKGROUND_CONTEXT);
  if (navigation.action === "redo") return sessionRuntime.redoCheckpoint({force}, BACKGROUND_CONTEXT);
  return sessionRuntime.undoCheckpoint({force}, BACKGROUND_CONTEXT);
}

/**
 * Session commands. Each shows its effect the moment the user acts, as optimism in the sessions store, and clears it
 * once the runtime shows the effect or the command failed.
 */
export function sessionActions(runtime: RuntimeClient) {
  const status = (sessionId: string) => {
    const {entries, optimism} = useSessionsStore.getState();
    return sessionStatus(entries[sessionId], optimism[sessionId]).status;
  };

  /** Starting a command clears the last failure and moves past the problem the runtime shows. */
  const begin = (sessionId: string, optimism: SessionOptimism): void =>
    patch(sessionId, {error: undefined, seenErrorAt: useSessionsStore.getState().entries[sessionId]?.error?.at, ...optimism});

  const fail = (sessionId: string, cause: unknown, fallback: string): void => patch(sessionId, {error: errorMessage(cause, fallback)});

  const pendingMessage = (input: SendMessageInput) => ({id: `msg_${crypto.randomUUID()}`, contentParts: input.contentParts, timestamp: new Date().toISOString()});

  const outgoingMessage = (input: SendMessageInput) => ({
    captureCheckpoints: useSettingsStore.getState().captureCheckpoints,
    contentParts: [...input.contentParts],
    modelReference: input.modelReference,
  });

  return {
    /** Shows the message at once. The runtime publishes its turn before the send resolves, so it never flickers. */
    sendMessage(input: SendMessageInput): void {
      const {sessionId} = input;
      if (status(sessionId) !== "idle") return;
      begin(sessionId, {message: pendingMessage(input)});
      void attachSession(runtime, sessionId)
        .then(() => unwrap(runtime.sessionRuntime.sendMessage(outgoingMessage(input), BACKGROUND_CONTEXT)))
        .catch((cause: unknown) => fail(sessionId, cause, "Failed to send message."))
        .finally(() => patch(sessionId, {message: undefined}));
    },

    /** Shows the new session and its first message at once; the runtime creates it under `sessionId`. */
    async startSession(input: StartSessionInput): Promise<StartSessionOutcome> {
      const {projectPath, sessionId, workspace} = input;
      setDocument(emptySession(projectPath, sessionId));
      // Worktree creation starts before the runtime can report it; showing it now keeps the thinking label from flashing first.
      begin(sessionId, {message: pendingMessage(input), setupStep: workspace.mode === "worktree" ? "worktree" : undefined});
      try {
        // The page follows the session from here on; the reply is its document until the first live value arrives.
        setDocument(await unwrap(runtime.sessions.create({id: sessionId, message: outgoingMessage(input), projectPath, workspace}, BACKGROUND_CONTEXT)));
        patch(sessionId, {message: undefined, setupStep: undefined});
        return {status: "started"};
      } catch (cause) {
        // The runtime removed the session, so nothing of it may remain here.
        forgetSession(sessionId);
        return {status: "failed", message: errorMessage(cause, "Failed to start the session.")};
      }
    },

    /** Shows the stop until the runtime reports the session no longer running. */
    abortSession(sessionId: string): void {
      if (status(sessionId) !== "streaming") return;
      patch(sessionId, {stopping: true});
      const settle = () => patch(sessionId, {stopping: undefined});
      void attachSession(runtime, sessionId)
        .then(() => runtime.sessionRuntime.abort(BACKGROUND_CONTEXT))
        .then((result) => (result.ok ? whenNotRunning(sessionId, settle) : settle()), settle);
    },

    /** Shows the compaction from the request on; once running, the runtime reports it as the session's activity. */
    compactSession(input: {readonly sessionId: string; readonly modelReference: ModelReference}): void {
      const {modelReference, sessionId} = input;
      if (status(sessionId) !== "idle") return;
      begin(sessionId, {compacting: true});
      void attachSession(runtime, sessionId)
        .then(() => unwrap(runtime.sessionRuntime.compact({modelReference}, BACKGROUND_CONTEXT)))
        .catch((cause: unknown) => fail(sessionId, cause, "Failed to compact session."))
        .finally(() => patch(sessionId, {compacting: undefined}));
    },

    /** Moves the timeline at once. A refused restore keeps it moved: retry with `force`, or `cancelNavigation`. */
    async navigateCheckpoint(input: CheckpointNavigation & {readonly sessionId: string; readonly force?: boolean}): Promise<CheckpointNavigationOutcome> {
      const {force = false, sessionId} = input;
      const current = status(sessionId);
      // Only a forced retry may start while a refused restore holds the timeline.
      if (current !== "idle" && !(force && current === "checkpoint-navigating")) return {status: "failed", code: undefined, message: "The session is busy."};
      begin(sessionId, {navigation: {turnId: input.turnId}});
      try {
        await attachSession(runtime, sessionId);
        await unwrap(navigate(runtime.sessionRuntime, input, force));
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

/** What a failed undo, redo, or revert tells the user. */
const NAVIGATION_FAILURE_TITLES: Readonly<Record<CheckpointNavigation["action"], string>> = {
  redo: "Unable to redo checkpoint",
  revert: "Unable to revert message",
  undo: "Unable to undo checkpoint",
};

interface UseSessionCommandsOptions {
  readonly sessionId: string;
  readonly view: SessionView;
  readonly modelReference: ModelReference | undefined;
}

/**
 * The commands of a session page, and the confirmation a refused restore waits on. A restore that would discard
 * workspace changes keeps the timeline moved until the user confirms (a forced retry) or cancels.
 */
export function useSessionCommands(options: UseSessionCommandsOptions) {
  const {modelReference, sessionId, view} = options;
  const actions = sessionActions(useRuntime());
  const [confirmation, setConfirmation] = useState<{readonly open: boolean; readonly reason: "conflict" | "uncaptured"}>({open: false, reason: "conflict"});
  // The navigation a refused restore is holding.
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
        showToast("Nothing to undo in this fork", "This message came from the session this one was forked from. Only messages sent in this session can be undone.");
      } else showToast(NAVIGATION_FAILURE_TITLES[navigation.action], outcome.message);
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

  return {
    /** Creates the session under its id with its first message; see `StartSessionOutcome`. */
    startSession: (input: Omit<StartSessionInput, "sessionId">): Promise<StartSessionOutcome> => actions.startSession({...input, sessionId}),
    sendMessage: (contentParts: readonly UserMessageContentPart[]): void => {
      if (modelReference) actions.sendMessage({contentParts, modelReference, sessionId});
    },
    stop: (): void => actions.abortSession(sessionId),
    compact: (): void => {
      if (modelReference) actions.compactSession({modelReference, sessionId});
    },
    undo: (): void => void navigate({action: "undo", turnId: view.turns.at(-1)?.id}),
    redo: (): void => void navigate({action: "redo", turnId: view.undoneTurns[0]?.id}),
    revertToMessage: (turnId: string): void => void navigate({action: "revert", turnId}),
    /** The pending confirmation for a restore that would discard manual workspace changes. */
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
