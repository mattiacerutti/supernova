import {BACKGROUND_CONTEXT as context} from "@earendil-works/chord/context";
import {useRef, useState} from "react";
import type {ModelReference, SessionWorkspaceSelection} from "@supernova/contracts/services/sessions/schemas";
import type {ChatDocument} from "@supernova/contracts/services/chat/schemas";
import type {UserMessageContentPart} from "@supernova/contracts/services/chat/schemas";
import type {ListedSession} from "@supernova/contracts/services/sessions/services";
import {forgetSession} from "@/features/sessions/api/sessions-sync";
import {readSessionView} from "@/features/sessions/hooks/use-session";
import {sessionStatus, sessionView} from "@/features/sessions/lib/session-view";
import type {SessionOptimism} from "@/features/sessions/stores/sessions-store";
import {useSessionsStore} from "@/features/sessions/stores/sessions-store";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {showToast} from "@/lib/toast";
import {useSettingsStore} from "@/stores/settings-store";
import type {CodeOf} from "@supernova/contracts/lib/errors";
import {failureOf} from "@supernova/contracts/lib/errors";
import {ChatErrors} from "@supernova/contracts/services/chat/services";
import type {ChatOwner, RuntimeClient} from "@/runtime/client";
import {useRuntime} from "@/runtime/hooks/use-runtime";

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

type CheckpointNavigation = ({readonly action: "redo" | "undo"} | {readonly action: "revert"; readonly turnId: string}) & {readonly lastTurnId: string | null};

type CheckpointNavigationOutcome =
  | {readonly status: "applied"}
  | {readonly status: "refused"; readonly reason: "conflict" | "uncaptured"}
  | {readonly status: "failed"; readonly code: CodeOf<typeof ChatErrors.undoCheckpoint> | undefined; readonly message: string};

const {patchOptimism: patch, setDocument, setRecord} = useSessionsStore.getState();

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}

function emptySession(projectPath: string, sessionId: string): {readonly record: ListedSession; readonly session: ChatDocument} {
  const updatedAt = new Date().toISOString();
  return {
    record: {id: sessionId, title: "Untitled session", forked: false, pinned: false, projectPath, updatedAt},
    session: emptyConversation(sessionId, updatedAt),
  };
}

function emptyConversation(sessionId: string, updatedAt: string): ChatDocument {
  return {
    id: sessionId,
    updatedAt,
    entries: {items: [], remaining: 0, precedingEntryId: null},
    undone: {items: [], remaining: 0, precedingEntryId: null},
    agent: {},
    live: {},
    usage: {models: {}, tools: {}},
    context: {usedTokens: 0, contextWindow: 0},
  };
}

const isRunning = (sessionId: string): boolean => useSessionsStore.getState().statuses[sessionId]?.activity === "running";

function whenNotRunning(sessionId: string, run: () => void): void {
  if (!isRunning(sessionId)) return run();
  const stop = useSessionsStore.subscribe(() => {
    if (isRunning(sessionId)) return;
    stop();
    run();
  });
}

function whenHasTurn(sessionId: string, run: () => void): void {
  const hasTurn = () => {
    const {documents, optimism} = useSessionsStore.getState();
    return !optimism[sessionId]?.message || (documents[sessionId]?.entries.items.length ?? 0) > 0;
  };
  if (hasTurn()) return run();
  const stop = useSessionsStore.subscribe(() => {
    if (!hasTurn()) return;
    stop();
    run();
  });
}

function shownLastTurnId(sessionId: string): string | null {
  const {documents, records, statuses} = useSessionsStore.getState();
  return sessionView({entry: statuses[sessionId], record: records[sessionId], session: documents[sessionId]}).turns.at(-1)?.id ?? null;
}

// The reply can come before the document that shows it, which the server publishes once it has read the turns.
function whenNavigated(sessionId: string, lastTurnId: string | null, run: () => void): void {
  const replied = useSessionsStore.getState().documents[sessionId];
  // Any change of turns also ends the wait: the server may have landed elsewhere than predicted.
  const settled = () => {
    const current = useSessionsStore.getState().documents[sessionId];
    return shownLastTurnId(sessionId) === lastTurnId || current?.entries !== replied?.entries || current?.undone !== replied?.undone;
  };
  // Without a followed document, nothing will arrive to wait for.
  if (!replied || shownLastTurnId(sessionId) === lastTurnId) return run();
  const stop = useSessionsStore.subscribe(() => {
    if (!settled()) return;
    stop();
    run();
  });
}

function navigate(chat: ChatOwner, navigation: CheckpointNavigation, force: boolean) {
  if (navigation.action === "revert") return chat.revertToMessage({force, turnId: navigation.turnId}, context);
  if (navigation.action === "redo") return chat.redoCheckpoint({force}, context);
  return chat.undoCheckpoint({force}, context);
}

export function sessionActions(runtime: RuntimeClient, chat: (sessionId: string) => ChatOwner) {
  const status = (sessionId: string) => {
    const {documents, optimism, statuses} = useSessionsStore.getState();
    return sessionStatus(statuses[sessionId], optimism[sessionId], documents[sessionId]).status;
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
      void chat(sessionId)
        .sendMessage(outgoingMessage(input), context)
        .catch((cause: unknown) => fail(sessionId, cause, "Failed to send message."))
        .finally(() => patch(sessionId, {message: undefined}));
    },

    async startSession(input: StartSessionInput): Promise<StartSessionOutcome> {
      const {projectPath, sessionId, workspace} = input;
      const started = emptySession(projectPath, sessionId);
      setRecord(started.record);
      setDocument(started.session);
      // The runtime reports worktree creation only once it has started.
      begin(sessionId, {message: pendingMessage(input), setupStep: workspace.mode === "worktree" ? "worktree" : undefined});
      try {
        await runtime.sessions.create({id: sessionId, message: outgoingMessage(input), projectPath, workspace}, context);
        patch(sessionId, {setupStep: undefined});
        whenHasTurn(sessionId, () => patch(sessionId, {message: undefined}));
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
      void chat(sessionId)
        .abort(context)
        .then(() => whenNotRunning(sessionId, settle), settle);
    },

    compactSession(input: {readonly sessionId: string; readonly modelReference: ModelReference}): void {
      const {modelReference, sessionId} = input;
      if (status(sessionId) !== "idle") return;
      begin(sessionId, {compacting: true});
      void chat(sessionId)
        .compact({modelReference}, context)
        .catch((cause: unknown) => fail(sessionId, cause, "Failed to compact session."))
        .finally(() => patch(sessionId, {compacting: undefined}));
    },

    async navigateCheckpoint(input: CheckpointNavigation & {readonly sessionId: string; readonly force?: boolean}): Promise<CheckpointNavigationOutcome> {
      const {force = false, sessionId} = input;
      const current = status(sessionId);
      // A refused restore holds the timeline until its forced retry.
      if (current !== "idle" && !(force && current === "checkpoint-navigating")) return {status: "failed", code: undefined, message: "The session is busy."};
      begin(sessionId, {navigation: {lastTurnId: input.lastTurnId}});
      try {
        await navigate(chat(sessionId), input, force);
        whenNavigated(sessionId, input.lastTurnId, () => patch(sessionId, {navigation: undefined}));
        return {status: "applied"};
      } catch (cause) {
        const code = failureOf(cause, ChatErrors.undoCheckpoint);
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
  readonly chat: ChatOwner | undefined;
  readonly modelReference: ModelReference | undefined;
}

export function useSessionCommands(options: UseSessionCommandsOptions) {
  const {chat, modelReference, sessionId} = options;
  const actions = sessionActions(useRuntime(), () => {
    if (!chat) throw new Error("The session is not open.");
    return chat;
  });
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
