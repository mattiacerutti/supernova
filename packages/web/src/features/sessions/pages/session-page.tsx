import type {Session, SessionWorkspaceSelection, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import {useNavigate} from "@tanstack/react-router";
import {useState} from "react";
import {useConfiguration} from "@/api/configuration";
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
import {useSession} from "@/features/sessions/hooks/use-session";
import {buildCommittedTimelineItems, buildLiveTimelineItems} from "@/features/sessions/lib/timeline/rows/build-session-timeline";
import {useComposerDraftsStore} from "@/features/sessions/stores/composer/composer-drafts-store";
import type {SessionTurn} from "@/features/sessions/types/session-turn";
import WorkspacePanel from "@/features/workspace/components/workspace-panel";
import WorkspacePanelToggle from "@/features/workspace/components/workspace-panel-toggle";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {projectIdFromPath} from "@/lib/project-paths";
import {showToast} from "@/lib/toast";

interface SessionTitleProps {
  readonly session: Session;
  /** The title and pin as shown, with a rename or pin the runtime has not shown yet. */
  readonly title: string;
  readonly pinned: boolean;
}

function SessionTitle(props: SessionTitleProps) {
  const {pinned, session, title} = props;
  const renameSession = useRenameSession();
  const {inputProps, renaming, startRenaming} = useInlineRename({initialValue: title, onSave: (nextTitle) => renameSession.mutate({sessionId: session.id, title: nextTitle})});

  return (
    <SessionHeader
      actions={
        <SessionActionsMenu
          onRename={startRenaming}
          pinned={pinned}
          projectPath={session.projectPath}
          sessionId={session.id}
          sessionTitle={title}
          worktree={session.worktree !== undefined}
        />
      }
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

/** Shows the title the sidebar already knows while the session loads. */
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

/** Keeps the shown session's document live while mounted. */
function FollowSession(props: FollowSessionProps) {
  useFollowSession(props.sessionId);
  return null;
}

/**
 * What the page shows. A new session already has the id it will be created under, so the draft, model choice,
 * and page identity carry over unchanged when its first message turns it into a session.
 */
export type SessionPageTarget =
  | {readonly kind: "new"; readonly projectName: string; readonly projectPath: string; readonly sessionId: string}
  | {readonly kind: "session"; readonly sessionId: string};

interface SessionPageProps {
  readonly target: SessionPageTarget;
}

/**
 * One page for a project's new-session screen and an existing session. Sending the first
 * message turns the first into the second without remounting: the composer stays the same
 * element and docks from the centered hero to the bottom while the URL changes underneath.
 */
export default function SessionPage(props: SessionPageProps) {
  const {target} = props;
  const {sessionId} = target;
  const navigate = useNavigate();
  const setNewSessionId = useComposerDraftsStore((state) => state.setNewSessionId);

  // Until the runtime has created the session it exists only in the store; reading it would race creation.
  // The workspace it was started with is kept here because the draft is cleared on submit.
  const [creatingWorkspace, setCreatingWorkspace] = useState<SessionWorkspaceSelection | null>(null);
  const creatingSession = creatingWorkspace !== null;
  const view = useSession(sessionId);
  const {session} = view;
  const newSessionProjectPath = target.kind === "new" ? target.projectPath : undefined;
  const configuration = useConfiguration(newSessionProjectPath);
  const projectPath = newSessionProjectPath ?? session?.projectPath ?? "";

  const composer = useComposer({
    disabled: target.kind === "new" && configuration.isPending,
    initialModelReference: session?.agent.model && {id: session.agent.model.modelId, providerId: session.agent.model.provider, thinkingLevel: session.agent.thinkingLevel ?? "off"},
    modelDefaults: configuration.data?.modelDefaults,
    projectPath,
    sessionId,
  });
  const commands = useSessionCommands({modelReference: composer.models.modelReference, sessionId, view});
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

    showToast("Unable to start the session", outcome.message);
    setNewSessionId(target.projectPath, sessionId);
    composer.draft.replaceContentParts(contentParts);
    composer.draft.setWorkspace(workspace);
    void navigate({replace: true, search: {draft: sessionId, projectId: projectIdFromPath(target.projectPath)}, to: "/session/new"});
  };

  /** Puts a turn's prompt back into the composer before the checkpoint moves. */
  const restoreDraftFrom = (turn: SessionTurn | undefined): void => {
    composer.draft.replaceContentParts(turn?.userMessage.contentParts ?? []);
  };

  const handleUndo = (): void => {
    if (!session || !idle) return;
    restoreDraftFrom(view.turns.at(-1));
    commands.undo();
  };

  const handleRedo = (): void => {
    if (!session || !idle) return;
    restoreDraftFrom(view.undoneTurns[1]);
    commands.redo();
  };

  const handleRevertToMessage = (turnId: string): void => {
    if (!session || !idle) return;
    restoreDraftFrom([...view.turns, ...view.undoneTurns].find((turn) => turn.id === turnId));
    commands.revertToMessage(turnId);
  };

  const handleRestoreUndoneTurn = (turnId: string): void => {
    if (!session || !idle) return;
    const restoredIndex = view.undoneTurns.findIndex((turn) => turn.id === turnId);
    restoreDraftFrom(view.undoneTurns[restoredIndex + 1]);
    commands.revertToMessage(turnId);
  };

  const handleForkFromTurn = (turnId: string): void => {
    if (!idle) return;
    setForkTurnId(turnId);
  };

  const handleUndoneDrawerHeightChange = (height: number): void => {
    setUndoneDrawerHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
  };

  if (target.kind === "session" && !session && view.loadError) {
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
        aside={session && <WorkspacePanel projectPath={session.worktree?.path ?? session.projectPath} sessionId={session.id} />}
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
        ) : session ? (
          <SessionTitle pinned={view.pinned} session={session} title={view.title ?? session.title} />
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
                bottomBar={
                  target.kind === "new" ? (
                    <WorkspacePicker />
                  ) : session?.worktree ? (
                    <WorkspacePicker worktreeBranch={session.worktree.branch} />
                  ) : (
                    // The branch name only arrives with the first snapshot.
                    creatingWorkspace?.mode === "worktree" && <WorkspacePickerSkeleton />
                  )
                }
                onInterrupt={commands.stop}
                onSubmit={target.kind === "new" ? (contentParts) => void startSession(contentParts) : commands.sendMessage}
                slashCommandActions={session && {compact: commands.compact, redo: handleRedo, undo: handleUndo}}
                streamStatus={view.status}
                topExtension={
                  session && (
                    <UndoneTurnsDrawer
                      disabled={composer.disabled || !idle}
                      onHeightChange={handleUndoneDrawerHeightChange}
                      onRevertToMessage={handleRestoreUndoneTurn}
                      turns={view.undoneTurns}
                    />
                  )
                }
              >
                {session && <SessionContextIndicator context={session.context} />}
                <ModelPicker />
                <ThinkingLevelPicker />
              </SessionComposer>
            )
          }
          hero={target.kind === "new" ? <NewSessionHero projectName={target.projectName} /> : undefined}
          timeline={
            session ? (
              <SessionTimeline
                key={session.id}
                bottomOverlayHeight={undoneDrawerHeight}
                compacting={view.status === "compacting"}
                isStreaming={streaming}
                items={committedItems}
                liveItems={liveItems}
                onForkFromTurn={idle ? handleForkFromTurn : undefined}
                onRevertToMessage={handleRevertToMessage}
                sessionId={session.id}
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
      {session && <ForkSessionDialog onClose={() => setForkTurnId(null)} sessionId={session.id} turnId={forkTurnId} />}
      <CheckpointConflictDialog
        onCancel={commands.checkpointConflict.cancel}
        onConfirm={commands.checkpointConflict.confirm}
        open={commands.checkpointConflict.open}
        reason={commands.checkpointConflict.reason}
      />
    </ComposerContext>
  );
}
