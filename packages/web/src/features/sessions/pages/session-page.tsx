import type {Session} from "@supernova/contracts/sessions/schemas";
import {useState} from "react";
import {useSession} from "@/features/sessions/api/conversation/get-session";
import {useRenameSession} from "@/features/sessions/api/sidebar/rename-session";
import CheckpointConflictDialog from "@/features/sessions/components/conversation/checkpoint-conflict-dialog";
import AttachmentDropOverlay from "@/features/sessions/components/conversation/attachment-drop-overlay";
import ModelPicker from "@/features/sessions/components/composer/toolbar/model-picker";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import SessionContextIndicator from "@/features/sessions/components/composer/toolbar/session-context-indicator";
import ThinkingLevelPicker from "@/features/sessions/components/composer/toolbar/thinking-level-picker";
import UndoneTurnsDrawer from "@/features/sessions/components/composer/undone-turns-drawer";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionLayout, {SessionHeader, SessionViewActions} from "@/features/sessions/components/conversation/session-layout";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import SessionTimeline from "@/features/sessions/components/timeline/session-timeline";
import SessionPageSkeleton from "@/features/sessions/pages/session-page-skeleton";
import {ComposerContext, useComposer} from "@/features/sessions/hooks/composer/use-composer";
import {useSessionTimeline} from "@/features/sessions/hooks/conversation/use-session-timeline";
import {sessionComposerDraftKey} from "@/features/sessions/stores/composer/composer-drafts-store";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import WorkspacePanel from "@/features/workspace/components/workspace-panel";
import WorkspacePanelToggle from "@/features/workspace/components/workspace-panel-toggle";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {useMountEffect} from "@/hooks/use-mount-effect";

interface SessionConversationProps {
  readonly session: Session;
}

/** A loaded session: header, timeline, composer, and workspace panel wired to the live stream. */
function SessionConversation(props: SessionConversationProps) {
  const {session} = props;

  const markSessionVisited = useSessionVisitsStore((state) => state.markSessionVisited);
  const renameSession = useRenameSession();
  const {
    inputProps: renameInputProps,
    renaming,
    startRenaming,
  } = useInlineRename({initialValue: session.title, onSave: (title) => renameSession.mutate({sessionId: session.id, title})});

  // Opening a session clears its unseen activity. The route remounts this
  // page per session, so the stamp lands once per open.
  useMountEffect(() => markSessionVisited(session.id, session.updatedAt));

  const composer = useComposer({
    draftKey: sessionComposerDraftKey(session.id),
    initialModelReference: session.modelReference,
    projectPath: session.projectPath,
    sessionId: session.id,
  });
  const stream = useSessionTimeline({modelReference: composer.models.modelReference, sessionId: session.id, sessionTurns: session.turns});
  const [undoneDrawerHeight, setUndoneDrawerHeight] = useState(0);

  const idle = stream.streamStatus === "idle";
  const streaming = stream.streamStatus === "streaming" || stream.streamStatus === "compacting";

  /** Puts a turn's prompt back into the composer before the checkpoint moves. */
  const restoreDraftFrom = (turn: Session["turns"][number] | undefined): void => {
    composer.draft.replaceContentParts(turn?.userMessage.contentParts ?? []);
  };

  const handleUndo = (): void => {
    if (!idle) return;
    restoreDraftFrom(session.turns.at(-1));
    stream.slashCommandActions.undo?.();
  };

  const handleRedo = (): void => {
    if (!idle) return;
    restoreDraftFrom(session.undoneTurns[1]);
    stream.slashCommandActions.redo?.();
  };

  const handleRevertToMessage = (turnId: string): void => {
    if (!idle) return;
    restoreDraftFrom([...session.turns, ...session.undoneTurns].find((turn) => turn.id === turnId));
    stream.revertToMessage(turnId);
  };

  const handleRestoreUndoneTurn = (turnId: string): void => {
    if (!idle) return;
    const restoredIndex = session.undoneTurns.findIndex((turn) => turn.id === turnId);
    restoreDraftFrom(session.undoneTurns[restoredIndex + 1]);
    stream.revertToMessage(turnId);
  };

  const handleUndoneDrawerHeightChange = (height: number): void => {
    setUndoneDrawerHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
  };

  return (
    <ComposerContext value={composer}>
      <SessionLayout
        {...composer.attachments.dropZoneProps}
        aside={<WorkspacePanel projectPath={session.projectPath} sessionId={session.id} />}
        overlay={
          <>
            <SessionViewActions>
              <WorkspacePanelToggle sessionId={session.id} />
            </SessionViewActions>
            {composer.attachments.isDraggingFiles && <AttachmentDropOverlay />}
          </>
        }
      >
        <SessionHeader actions={<SessionActionsMenu onRename={startRenaming} projectPath={session.projectPath} sessionId={session.id} sessionTitle={session.title} />}>
          {renaming ? (
            <input {...renameInputProps} className="block h-5 min-w-0 w-64 truncate border-0 bg-transparent p-0 text-sm font-medium leading-5 text-ink outline-none" />
          ) : (
            <SessionTitleText className="block truncate" title={session.title} />
          )}
        </SessionHeader>

        <SessionTimeline
          key={session.id}
          bottomOverlayHeight={undoneDrawerHeight}
          compacting={stream.streamStatus === "compacting"}
          isStreaming={streaming}
          items={stream.committedTimelineItems}
          liveItems={stream.liveTimelineItems}
          onRevertToMessage={handleRevertToMessage}
          sessionId={session.id}
          streamError={stream.streamError}
        />

        {composer.isPending ? (
          <SessionComposerSkeleton />
        ) : (
          <SessionComposer
            key={`${composer.draftKey}:${composer.draft.revision}`}
            onInterrupt={stream.stopStreaming}
            onSubmit={stream.submitMessage}
            slashCommandActions={{...stream.slashCommandActions, redo: handleRedo, undo: handleUndo}}
            streamStatus={stream.streamStatus}
            topExtension={
              <UndoneTurnsDrawer
                disabled={composer.disabled || !idle}
                onHeightChange={handleUndoneDrawerHeightChange}
                onRevertToMessage={handleRestoreUndoneTurn}
                turns={session.undoneTurns}
              />
            }
          >
            <SessionContextIndicator context={stream.liveContext ?? session.context} />
            <ModelPicker />
            <ThinkingLevelPicker />
          </SessionComposer>
        )}
      </SessionLayout>

      <CheckpointConflictDialog
        onCancel={stream.checkpointConflict.cancel}
        onConfirm={stream.checkpointConflict.confirm}
        open={stream.checkpointConflict.open}
        reason={stream.checkpointConflict.reason}
      />
    </ComposerContext>
  );
}

interface SessionPageProps {
  readonly sessionId: string;
}

export default function SessionPage(props: SessionPageProps) {
  const {sessionId} = props;
  const setActiveSession = useSessionLiveStore((state) => state.setActiveSession);
  const {data: session, error} = useSession(sessionId);

  // The route remounts this page per session via key={sessionId}.
  useMountEffect(() => {
    setActiveSession(sessionId);
    return () => setActiveSession(null);
  });

  if (session) return <SessionConversation session={session} />;

  if (error) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-10">
        <p className="text-sm text-danger-ink">Unable to load this session.</p>
      </div>
    );
  }

  return <SessionPageSkeleton sessionId={sessionId} />;
}
