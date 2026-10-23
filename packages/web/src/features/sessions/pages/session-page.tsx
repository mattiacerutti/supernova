import type {SessionWorkspaceSelection, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import {useNavigate} from "@tanstack/react-router";
import {useState} from "react";
import {useConfiguration} from "@/api/configuration";
import {useLoadHistory} from "@/features/sessions/api/conversation/load-history";
import {useSessionCommands} from "@/features/sessions/api/conversation/session-commands";

import {useRenameSession} from "@/features/sessions/api/sidebar/rename-session";
import ModelPicker from "@/features/sessions/components/composer/toolbar/model-picker";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import SessionContextIndicator from "@/features/sessions/components/composer/toolbar/session-context-indicator";
import ThinkingLevelPicker from "@/features/sessions/components/composer/toolbar/thinking-level-picker";
import UndoneTurnsDrawer from "@/features/sessions/components/composer/undone-turns-drawer";
import WorkspacePicker, {WorkspacePickerSkeleton} from "@/features/sessions/components/composer/toolbar/workspace-picker";
import AttachmentDropOverlay from "@/features/sessions/components/conversation/attachment-drop-overlay";
import CheckpointConflictDialog from "@/features/sessions/components/conversation/checkpoint-conflict-dialog";
import ForkSessionDialog from "@/features/sessions/components/conversation/fork-session-dialog";
import NewSessionHero from "@/features/sessions/components/conversation/new-session-hero";
import SessionLayout, {SessionBody, SessionHeader, SessionViewActions} from "@/features/sessions/components/conversation/session-layout";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import SessionTimeline from "@/features/sessions/components/timeline/session-timeline";
import {ComposerContext, useComposer} from "@/features/sessions/hooks/composer/use-composer";
import {useFollowSession} from "@/features/sessions/api/sessions-sync";
import {readSessionView, useSession} from "@/features/sessions/hooks/use-session";
import type {SessionView} from "@/features/sessions/lib/session-view";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/rows/build-session-timeline";
import {useComposerDraftsStore} from "@/features/sessions/stores/composer/composer-drafts-store";
import type {SessionTurn} from "@/features/sessions/types/session-turn";
import WorkspacePanel from "@/features/workspace/components/workspace-panel";
import WorkspacePanelToggle from "@/features/workspace/components/workspace-panel-toggle";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {projectIdFromPath} from "@/lib/project-paths";
import {showToast} from "@/lib/toast";

interface SessionTitleProps {
  readonly pinned: boolean;
  readonly projectPath: string;
  readonly sessionId: string;
  readonly title: string;
  readonly worktree: boolean;
}

function SessionTitle(props: SessionTitleProps) {
  const {pinned, projectPath, sessionId, title, worktree} = props;
  const renameSession = useRenameSession();
  const {inputProps, renaming, startRenaming} = useInlineRename({initialValue: title, onSave: (nextTitle) => renameSession.mutate({sessionId, title: nextTitle})});

  return (
    <SessionHeader
      actions={<SessionActionsMenu onRename={startRenaming} pinned={pinned} projectPath={projectPath} sessionId={sessionId} sessionTitle={title} worktree={worktree} />}
    >
      {renaming ? (
        <input {...inputProps} className="block h-5 min-w-0 w-64 truncate border-0 bg-transparent p-0 text-sm font-medium leading-5 text-ink outline-none" />
      ) : (
        <SessionTitleText className="block truncate" title={title} />
      )}
    </SessionHeader>
  );
}

interface LoadingTitleProps {
  readonly title: string | undefined;
}

function LoadingTitle(props: LoadingTitleProps) {
  const {title} = props;

  return (
    <SessionHeader>
      {title ? (
        <span className="block truncate">{title}</span>
      ) : (
        <span className="block h-4 w-36 animate-pulse rounded-full bg-overlay-pressed" aria-label="Loading session title" />
      )}
    </SessionHeader>
  );
}

interface FollowSessionProps {
  readonly sessionId: string;
}

function FollowSession(props: FollowSessionProps) {
  useFollowSession(props.sessionId);
  return null;
}

/** A new session already has its future id, so draft and model choice carry over when its first message creates it. */
export type SessionPageTarget =
  | {readonly kind: "new"; readonly projectName: string; readonly projectPath: string; readonly sessionId: string}
  | {readonly kind: "session"; readonly sessionId: string};

interface SessionPageProps {
  readonly target: SessionPageTarget;
}

/** The first message turns the new-session screen into a session without remounting; the composer docks in place. */
export default function SessionPage(props: SessionPageProps) {
  const {target} = props;
  const {sessionId} = target;
  const navigate = useNavigate();
  const setNewSessionId = useComposerDraftsStore((state) => state.setNewSessionId);

  // Kept here because the draft is cleared on submit, before the runtime has the session.
  const [creatingWorkspace, setCreatingWorkspace] = useState<SessionWorkspaceSelection | null>(null);
  const creatingSession = creatingWorkspace !== null;
  const view = useSession(sessionId);
  const {session} = view;
  // The document is replaced on every streamed frame; only the parts read below are passed on, so everything that
  // does not show the timeline keeps its props and skips those renders.
  const hasSession = session !== undefined;
  const agent = session?.agent;
  const sessionContext = session?.context;
  const sessionProjectPath = session?.projectPath;
  const sessionTitle = session?.title;
  const worktree = session?.worktree;
  const entriesRemaining = session?.entries.remaining ?? 0;
  const undoneRemaining = session?.undone.remaining ?? 0;
  const newSessionProjectPath = target.kind === "new" ? target.projectPath : undefined;
  const configuration = useConfiguration(newSessionProjectPath);
  const projectPath = newSessionProjectPath ?? sessionProjectPath ?? "";

  const composer = useComposer({
    disabled: target.kind === "new" && configuration.isPending,
    initialModelReference: agent?.model && {id: agent.model.modelId, providerId: agent.model.provider, thinkingLevel: agent.thinkingLevel ?? "off"},
    modelDefaults: configuration.data?.modelDefaults,
    projectPath,
    sessionId,
  });
  const {replaceContentParts} = composer.draft;
  const commands = useSessionCommands({modelReference: composer.models.modelReference, sessionId});
  const earlierHistory = useLoadHistory(sessionId, "entries");
  const laterUndone = useLoadHistory(sessionId, "undone");
  const [undoneDrawerHeight, setUndoneDrawerHeight] = useState(0);
  const [forkTurnId, setForkTurnId] = useState<string | null>(null);

  const composerPending = composer.isPending || (target.kind === "new" && configuration.isPending);

  const idle = view.status === "idle";
  const streaming = view.status === "streaming" || view.status === "compacting";
  const committedItems = buildCommittedTimelineItems(view.turns);
  const liveItems = buildLiveTimelineItems({live: streaming, liveTurn: view.liveTurn ?? null});

  const startSession = async (contentParts: readonly UserMessageContentPart[]): Promise<void> => {
    const modelReference = composer.models.modelReference;
    if (target.kind !== "new" || composer.disabled || !modelReference) return;

    const {workspace} = composer.draft;
    setCreatingWorkspace(workspace);
    setNewSessionId(target.projectPath, undefined);
    const pending = commands.startSession({contentParts, modelReference, projectPath: target.projectPath, workspace});
    void navigate({params: {sessionId}, replace: true, to: "/session/$sessionId"});

    const outcome = await pending;
    setCreatingWorkspace(null);
    if (outcome.status === "started") return;

    // Not scoped to the session: it no longer exists, and the user is back on the new-session screen.
    showToast("Unable to start the session", outcome.message, {type: "error"});
    setNewSessionId(target.projectPath, sessionId);
    composer.draft.replaceContentParts(contentParts);
    composer.draft.setWorkspace(workspace);
    void navigate({replace: true, search: {draft: sessionId, projectId: projectIdFromPath(target.projectPath)}, to: "/session/new"});
  };

  const restoreDraftFrom = (turn: SessionTurn | undefined): void => {
    replaceContentParts(turn?.userMessage.contentParts ?? []);
  };

  // These read the view when they run, so the timeline and composer keep the same handlers while a response streams.
  const idleView = (): SessionView | undefined => {
    const current = readSessionView(sessionId);
    return current.session && current.status === "idle" ? current : undefined;
  };

  const handleUndo = (): void => {
    const current = idleView();
    if (!current) return;
    restoreDraftFrom(current.turns.at(-1));
    commands.undo();
  };

  const handleRedo = (): void => {
    const current = idleView();
    if (!current) return;
    restoreDraftFrom(current.undoneTurns[1]);
    commands.redo();
  };

  const handleRevertToMessage = (turnId: string): void => {
    const current = idleView();
    if (!current) return;
    restoreDraftFrom([...current.turns, ...current.undoneTurns].find((turn) => turn.id === turnId));
    commands.revertToMessage(turnId);
  };

  const handleRestoreUndoneTurn = (turnId: string): void => {
    const current = idleView();
    if (!current) return;
    const restoredIndex = current.undoneTurns.findIndex((turn) => turn.id === turnId);
    restoreDraftFrom(current.undoneTurns[restoredIndex + 1]);
    commands.revertToMessage(turnId);
  };

  const handleForkFromTurn = (turnId: string): void => {
    if (!idle) return;
    setForkTurnId(turnId);
  };

  const handleUndoneDrawerHeightChange = (height: number): void => {
    setUndoneDrawerHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
  };

  if (target.kind === "session" && !hasSession && view.loadError) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-10">
        <p className="text-sm text-danger-ink">Unable to load this session.</p>
      </div>
    );
  }

  return (
    <ComposerContext value={composer}>
      <SessionLayout
        {...composer.attachments.dropZoneProps}
        aside={sessionProjectPath !== undefined && <WorkspacePanel projectPath={worktree?.path ?? sessionProjectPath} sessionId={sessionId} />}
        overlay={
          <>
            {target.kind === "session" && (
              <SessionViewActions>
                <WorkspacePanelToggle sessionId={sessionId} />
              </SessionViewActions>
            )}
            {composer.attachments.isDraggingFiles && <AttachmentDropOverlay />}
          </>
        }
      >
        {target.kind === "new" ? (
          <SessionHeader />
        ) : sessionProjectPath !== undefined ? (
          <SessionTitle pinned={view.pinned} projectPath={sessionProjectPath} sessionId={sessionId} title={view.title ?? sessionTitle ?? ""} worktree={worktree !== undefined} />
        ) : (
          <LoadingTitle title={view.title} />
        )}

        <SessionBody
          composer={
            composerPending ? (
              <SessionComposerSkeleton />
            ) : (
              <SessionComposer
                key={composer.draft.revision}
                autoFocus={target.kind === "new"}
                bottomBar={
                  target.kind === "new" ? (
                    <WorkspacePicker />
                  ) : worktree ? (
                    <WorkspacePicker worktreeBranch={worktree.branch} />
                  ) : (
                    // The branch name only arrives with the first snapshot.
                    creatingWorkspace?.mode === "worktree" && <WorkspacePickerSkeleton />
                  )
                }
                onInterrupt={commands.stop}
                onSubmit={target.kind === "new" ? (contentParts) => void startSession(contentParts) : commands.sendMessage}
                slashCommandActions={hasSession ? {compact: commands.compact, redo: handleRedo, undo: handleUndo} : undefined}
                streamStatus={view.status}
                topExtension={
                  hasSession && (
                    <UndoneTurnsDrawer
                      disabled={composer.disabled || !idle}
                      later={{count: undoneRemaining, ...laterUndone}}
                      onHeightChange={handleUndoneDrawerHeightChange}
                      onRevertToMessage={handleRestoreUndoneTurn}
                      turns={view.undoneTurns}
                    />
                  )
                }
              >
                {sessionContext && <SessionContextIndicator context={sessionContext} />}
                <ModelPicker />
                <ThinkingLevelPicker />
              </SessionComposer>
            )
          }
          hero={target.kind === "new" ? <NewSessionHero projectName={target.projectName} /> : undefined}
          timeline={
            hasSession ? (
              <SessionTimeline
                key={sessionId}
                bottomOverlayHeight={undoneDrawerHeight}
                compacting={view.status === "compacting"}
                earlierHistory={{count: entriesRemaining, ...earlierHistory}}
                lastCopiedTurnId={session.lastCopiedTurnId}
                isStreaming={streaming}
                items={committedItems}
                liveItems={liveItems}
                onForkFromTurn={idle ? handleForkFromTurn : undefined}
                onRevertToMessage={handleRevertToMessage}
                sessionId={sessionId}
                setupStep={view.setupStep}
                streamError={view.error}
              />
            ) : (
              <div className="min-h-0 flex-1" />
            )
          }
        />
      </SessionLayout>

      {target.kind === "session" && !creatingSession && <FollowSession key={sessionId} sessionId={sessionId} />}
      {hasSession && <ForkSessionDialog onClose={() => setForkTurnId(null)} sessionId={sessionId} turnId={forkTurnId} />}
      <CheckpointConflictDialog
        onCancel={commands.checkpointConflict.cancel}
        onConfirm={commands.checkpointConflict.confirm}
        open={commands.checkpointConflict.open}
        reason={commands.checkpointConflict.reason}
      />
    </ComposerContext>
  );
}
