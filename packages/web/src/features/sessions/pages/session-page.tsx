import type {Session, UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useNavigate} from "@tanstack/react-router";
import {useState} from "react";
import {useConfiguration} from "@/api/configuration";
import {useSession} from "@/features/sessions/api/conversation/get-session";
import {useSessionActions} from "@/features/sessions/api/conversation/session-actions";
import {useRenameSession} from "@/features/sessions/api/sidebar/rename-session";
import ModelPicker from "@/features/sessions/components/composer/toolbar/model-picker";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import SessionContextIndicator from "@/features/sessions/components/composer/toolbar/session-context-indicator";
import ThinkingLevelPicker from "@/features/sessions/components/composer/toolbar/thinking-level-picker";
import UndoneTurnsDrawer from "@/features/sessions/components/composer/undone-turns-drawer";
import AttachmentDropOverlay from "@/features/sessions/components/conversation/attachment-drop-overlay";
import CheckpointConflictDialog from "@/features/sessions/components/conversation/checkpoint-conflict-dialog";
import NewSessionHero from "@/features/sessions/components/conversation/new-session-hero";
import SessionLayout, {SessionBody, SessionHeader, SessionViewActions} from "@/features/sessions/components/conversation/session-layout";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import SessionTimeline from "@/features/sessions/components/timeline/session-timeline";
import {ComposerContext, useComposer} from "@/features/sessions/hooks/composer/use-composer";
import {useCachedSessionTitle} from "@/features/sessions/hooks/conversation/use-cached-session-title";
import {useSessionTimeline} from "@/features/sessions/hooks/conversation/use-session-timeline";
import {useComposerDraftsStore} from "@/features/sessions/stores/composer/composer-drafts-store";
import {useSessionLiveStore} from "@/features/sessions/stores/conversation/session-live-store";
import {useSessionVisitsStore} from "@/features/sessions/stores/sidebar/session-visits-store";
import WorkspacePanel from "@/features/workspace/components/workspace-panel";
import WorkspacePanelToggle from "@/features/workspace/components/workspace-panel-toggle";
import {useInlineRename} from "@/hooks/use-inline-rename";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {projectIdFromPath} from "@/lib/project-paths";
import {showToast} from "@/lib/toast";

interface SessionTitleProps {
  readonly session: Session;
}

function SessionTitle(props: SessionTitleProps) {
  const {session} = props;
  const renameSession = useRenameSession();
  const {inputProps, renaming, startRenaming} = useInlineRename({initialValue: session.title, onSave: (title) => renameSession.mutate({sessionId: session.id, title})});

  return (
    <SessionHeader actions={<SessionActionsMenu onRename={startRenaming} projectPath={session.projectPath} sessionId={session.id} sessionTitle={session.title} />}>
      {renaming ? (
        <input {...inputProps} className="block h-5 min-w-0 w-64 truncate border-0 bg-transparent p-0 text-sm font-medium leading-5 text-ink outline-none" />
      ) : (
        <SessionTitleText className="block truncate" title={session.title} />
      )}
    </SessionHeader>
  );
}

interface LoadingTitleProps {
  readonly sessionId: string;
}

/** Shows the title from the sidebar cache while the session loads. */
function LoadingTitle(props: LoadingTitleProps) {
  const cachedTitle = useCachedSessionTitle(props.sessionId);

  return (
    <SessionHeader>
      {cachedTitle ? (
        <span className="block truncate">{cachedTitle}</span>
      ) : (
        <span className="block h-4 w-36 animate-pulse rounded-full bg-overlay-pressed" aria-label="Loading session title" />
      )}
    </SessionHeader>
  );
}

interface SessionActivityProps {
  readonly session: Session;
}

/** Marks the shown session active and seen. */
function SessionActivity(props: SessionActivityProps) {
  const {session} = props;
  const setActiveSession = useSessionLiveStore((state) => state.setActiveSession);
  const markSessionVisited = useSessionVisitsStore((state) => state.markSessionVisited);

  useMountEffect(() => {
    setActiveSession(session.id);
    markSessionVisited(session.id, session.updatedAt);
    return () => setActiveSession(null);
  });

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
  const {startSession: startSessionAction} = useSessionActions();
  const setNewSessionId = useComposerDraftsStore((state) => state.setNewSessionId);

  // Until the server has created the session it exists only in the cache; fetching it would race creation.
  const [creatingSession, setCreatingSession] = useState(false);
  const {data: session, error} = useSession(sessionId, {enabled: target.kind === "session" && !creatingSession});
  const newSessionProjectPath = target.kind === "new" ? target.projectPath : undefined;
  const configuration = useConfiguration(newSessionProjectPath);
  const projectPath = newSessionProjectPath ?? session?.projectPath ?? "";

  const composer = useComposer({
    disabled: target.kind === "new" && configuration.isFetching,
    initialModelReference: session?.modelReference,
    modelDefaults: configuration.data?.modelDefaults,
    projectPath,
    sessionId,
  });
  const stream = useSessionTimeline({modelReference: composer.models.modelReference, sessionId, sessionTurns: session?.turns ?? []});
  const [undoneDrawerHeight, setUndoneDrawerHeight] = useState(0);

  const composerPending = composer.isPending || (target.kind === "new" && configuration.isPending);

  const idle = stream.streamStatus === "idle";
  const streaming = stream.streamStatus === "streaming" || stream.streamStatus === "compacting";

  const startSession = async (contentParts: readonly UserMessageContentPart[]): Promise<void> => {
    const modelReference = composer.models.modelReference;
    if (target.kind !== "new" || composer.disabled || !modelReference) return;

    setCreatingSession(true);
    setNewSessionId(target.projectPath, undefined);
    const pending = startSessionAction({contentParts, modelReference, projectPath: target.projectPath, sessionId});
    void navigate({params: {sessionId}, replace: true, to: "/session/$sessionId"});

    const outcome = await pending;
    setCreatingSession(false);
    if (outcome.status === "started") return;

    showToast("Unable to start the session", outcome.message);
    setNewSessionId(target.projectPath, sessionId);
    composer.draft.replaceContentParts(contentParts);
    void navigate({replace: true, search: {draft: sessionId, projectId: projectIdFromPath(target.projectPath)}, to: "/session/new"});
  };

  /** Puts a turn's prompt back into the composer before the checkpoint moves. */
  const restoreDraftFrom = (turn: Session["turns"][number] | undefined): void => {
    composer.draft.replaceContentParts(turn?.userMessage.contentParts ?? []);
  };

  const handleUndo = (): void => {
    if (!session || !idle) return;
    restoreDraftFrom(session.turns.at(-1));
    stream.slashCommandActions.undo?.();
  };

  const handleRedo = (): void => {
    if (!session || !idle) return;
    restoreDraftFrom(session.undoneTurns[1]);
    stream.slashCommandActions.redo?.();
  };

  const handleRevertToMessage = (turnId: string): void => {
    if (!session || !idle) return;
    restoreDraftFrom([...session.turns, ...session.undoneTurns].find((turn) => turn.id === turnId));
    stream.revertToMessage(turnId);
  };

  const handleRestoreUndoneTurn = (turnId: string): void => {
    if (!session || !idle) return;
    const restoredIndex = session.undoneTurns.findIndex((turn) => turn.id === turnId);
    restoreDraftFrom(session.undoneTurns[restoredIndex + 1]);
    stream.revertToMessage(turnId);
  };

  const handleUndoneDrawerHeightChange = (height: number): void => {
    setUndoneDrawerHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
  };

  if (target.kind === "session" && !session && error) {
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
        aside={session && <WorkspacePanel projectPath={session.projectPath} sessionId={session.id} />}
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
        {target.kind === "new" ? <SessionHeader /> : session ? <SessionTitle session={session} /> : <LoadingTitle sessionId={sessionId} />}

        <SessionBody
          composer={
            composerPending ? (
              <SessionComposerSkeleton />
            ) : (
              <SessionComposer
                key={composer.draft.revision}
                onInterrupt={stream.stopStreaming}
                onSubmit={target.kind === "new" ? (contentParts) => void startSession(contentParts) : stream.submitMessage}
                slashCommandActions={session && {...stream.slashCommandActions, redo: handleRedo, undo: handleUndo}}
                streamStatus={stream.streamStatus}
                topExtension={
                  session && (
                    <UndoneTurnsDrawer
                      disabled={composer.disabled || !idle}
                      onHeightChange={handleUndoneDrawerHeightChange}
                      onRevertToMessage={handleRestoreUndoneTurn}
                      turns={session.undoneTurns}
                    />
                  )
                }
              >
                {session && <SessionContextIndicator context={stream.liveContext ?? session.context} />}
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
                compacting={stream.streamStatus === "compacting"}
                isStreaming={streaming}
                items={stream.committedTimelineItems}
                liveItems={stream.liveTimelineItems}
                onRevertToMessage={handleRevertToMessage}
                sessionId={session.id}
                streamError={stream.streamError}
              />
            ) : (
              <div className="min-h-0 flex-1" />
            )
          }
        />
      </SessionLayout>

      {session && <SessionActivity key={session.id} session={session} />}
      <CheckpointConflictDialog
        onCancel={stream.checkpointConflict.cancel}
        onConfirm={stream.checkpointConflict.confirm}
        open={stream.checkpointConflict.open}
        reason={stream.checkpointConflict.reason}
      />
    </ComposerContext>
  );
}
