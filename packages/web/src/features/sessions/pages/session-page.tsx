import type {Session} from "@supernova/contracts/sessions/schemas";
import {useCallback, useState} from "react";
import type {AppEnvironment} from "@/app/app-environment";
import ModelPicker from "@/features/sessions/components/composer/pickers/model-picker";
import ThinkingLevelPicker from "@/features/sessions/components/composer/pickers/thinking-level-picker";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import SessionContextIndicator from "@/features/sessions/components/composer/session-context-indicator";
import UndoneTurnsDrawer from "@/features/sessions/components/composer/undone-turns-drawer";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionLayout from "@/features/sessions/components/session-layout";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import SessionTimeline from "@/features/sessions/components/timeline/session-timeline";
import {useRenameSession as useRenameSessionMutation} from "@/features/sessions/hooks/api/use-rename-session";
import {useSession} from "@/features/sessions/hooks/api/use-session";
import {useCachedSessionTitle} from "@/features/sessions/hooks/use-cached-session-title";
import {useComposerAttachments} from "@/features/sessions/hooks/use-composer-attachments";
import {useComposerDraft} from "@/features/sessions/hooks/use-composer-draft";
import {useComposerModelSelection} from "@/features/sessions/hooks/use-composer-model-selection";
import {useSessionTimeline} from "@/features/sessions/hooks/use-session-timeline";
import {sessionComposerDraftKey} from "@/features/sessions/stores/composer-drafts-store";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {useInlineRename} from "@/hooks/use-inline-rename";

interface SessionLoadingProps {
  readonly appEnvironment: AppEnvironment;
  readonly sessionId: string;
}

function SessionLoading(props: SessionLoadingProps) {
  const {appEnvironment, sessionId} = props;
  const cachedTitle = useCachedSessionTitle(sessionId);

  return (
    <SessionLayout
      appEnvironment={appEnvironment}
      composer={<SessionComposerSkeleton />}
      timeline={<div className="min-h-0 flex-1" />}
      title={
        cachedTitle ? (
          <span className="block truncate">{cachedTitle}</span>
        ) : (
          <span className="block h-4 w-36 animate-pulse rounded-full bg-white/10" aria-label="Loading session title" />
        )
      }
    />
  );
}

interface SessionConversationProps {
  readonly appEnvironment: AppEnvironment;
  readonly session: Session;
}

function SessionConversation(props: SessionConversationProps) {
  const {appEnvironment, session} = props;

  const renameSessionMutation = useRenameSessionMutation();
  const {
    draftName,
    handleBlur: handleRenameBlur,
    handleChange: handleRenameChange,
    handleClick: handleRenameClick,
    handleFocus: handleRenameFocus,
    handleInputRef: renameInputRef,
    handleKeyDown: handleRenameKeyDown,
    renaming,
    startRenaming,
  } = useInlineRename({initialValue: session.title, onSave: (title) => renameSessionMutation.mutate({sessionId: session.id, title})});

  const modelSelection = useComposerModelSelection({initialSelection: session.modelReference, sessionId: session.id});
  const composerDraftKey = sessionComposerDraftKey(session.id);
  const composerDraft = useComposerDraft({key: composerDraftKey});
  const stream = useSessionTimeline({modelReference: modelSelection.modelReference, sessionId: session.id, sessionTurns: session.turns});
  const [undoneDrawerHeight, setUndoneDrawerHeight] = useState(0);

  const composerDisabled = modelSelection.isPending || !modelSelection.modelReference;
  const composerActionDisabled = composerDisabled || stream.streamStatus !== "idle";
  const thinkingLevels = modelSelection.selectedModelDetails?.thinkingLevels ?? [];
  const composerAttachments = useComposerAttachments({
    attachments: composerDraft.attachments,
    disabled: composerDisabled,
    imageSupported: modelSelection.selectedModelDetails?.capabilities.images === true,
    onAttachmentsChange: composerDraft.setAttachments,
  });

  const handleModelChange = (value: string): void => {
    const nextModel = modelSelection.findModel(value);
    if (!nextModel) return;

    if (!nextModel.capabilities.images) composerAttachments.removeUnsupportedImages();
    modelSelection.selectModel(value);
  };

  const handleUndo = (): void => {
    if (stream.streamStatus !== "idle") return;

    const turn = session.turns.at(-1);
    if (turn) composerDraft.replaceContentParts(turn.userMessage.contentParts);
    stream.slashCommandActions.undo?.();
  };

  const handleRedo = (): void => {
    if (stream.streamStatus !== "idle") return;

    composerDraft.replaceContentParts(session.undoneTurns[1]?.userMessage.contentParts ?? []);
    stream.slashCommandActions.redo?.();
  };

  const handleRevertToMessage = (turnId: string): void => {
    if (stream.streamStatus !== "idle") return;

    const turn = [...session.turns, ...session.undoneTurns].find((item) => item.id === turnId);
    if (turn) composerDraft.replaceContentParts(turn.userMessage.contentParts);
    stream.revertToMessage(turnId);
  };

  const handleRestoreUndoneTurn = (turnId: string): void => {
    if (stream.streamStatus !== "idle") return;

    const restoredTurnIndex = session.undoneTurns.findIndex((turn) => turn.id === turnId);
    composerDraft.replaceContentParts(session.undoneTurns[restoredTurnIndex + 1]?.userMessage.contentParts ?? []);
    stream.revertToMessage(turnId);
  };

  const handleUndoneDrawerHeightChange = useCallback((height: number): void => {
    setUndoneDrawerHeight((current) => (Math.abs(current - height) < 0.5 ? current : height));
  }, []);

  return (
    <SessionLayout
      appEnvironment={appEnvironment}
      attachmentDropOverlayVisible={composerAttachments.isDraggingFiles}
      attachmentDropZoneProps={composerAttachments.dropZoneProps}
      composer={
        modelSelection.isPending ? (
          <SessionComposerSkeleton />
        ) : (
          <SessionComposer
            key={`${composerDraftKey}:${composerDraft.revision}`}
            attachments={composerAttachments}
            disabled={composerDisabled}
            draft={composerDraft}
            onInterrupt={stream.stopStreaming}
            onSubmit={stream.submitMessage}
            projectPath={session.projectPath}
            slashCommandActions={{...stream.slashCommandActions, redo: handleRedo, undo: handleUndo}}
            streamStatus={stream.streamStatus}
            toolbarControls={
              <div className="flex items-center gap-2">
                <SessionContextIndicator context={session.context} />
                <ModelPicker selectedModel={modelSelection.selectedModelDetails} disabled={composerDisabled} models={modelSelection.availableModels} onModelChange={handleModelChange} />
                {thinkingLevels.length > 0 && (
                  <ThinkingLevelPicker
                    disabled={composerDisabled}
                    onThinkingLevelChange={modelSelection.selectThinkingLevel}
                    selectedThinkingLabel={modelSelection.selectedThinkingLabel}
                    selectedThinkingLevel={modelSelection.modelReference?.thinkingLevel}
                    thinkingLevels={thinkingLevels}
                  />
                )}
              </div>
            }
            topExtension={
              <UndoneTurnsDrawer
                disabled={composerActionDisabled}
                onHeightChange={handleUndoneDrawerHeightChange}
                onRevertToMessage={handleRestoreUndoneTurn}
                turns={session.undoneTurns}
              />
            }
          />
        )
      }
      timeline={
        <SessionTimeline
          key={session.id}
          bottomOverlayHeight={undoneDrawerHeight}
          compacting={stream.streamStatus === "compacting"}
          isStreaming={stream.streamStatus === "streaming" || stream.streamStatus === "compacting"}
          items={stream.committedTimelineItems}
          liveItems={stream.liveTimelineItems}
          onRevertToMessage={handleRevertToMessage}
          sessionId={session.id}
          streamError={stream.streamError}
        />
      }
      title={
        renaming ? (
          <input
            className="block h-5 min-w-0 w-64 truncate border-0 bg-transparent p-0 text-sm font-medium leading-5 text-neutral-200 outline-none"
            onBlur={handleRenameBlur}
            onChange={handleRenameChange}
            onClick={handleRenameClick}
            onFocus={handleRenameFocus}
            onKeyDown={handleRenameKeyDown}
            ref={renameInputRef}
            value={draftName}
          />
        ) : (
          <SessionTitleText className="block truncate" title={session.title} />
        )
      }
      titleActions={<SessionActionsMenu onRename={startRenaming} projectPath={session.projectPath} sessionId={session.id} sessionTitle={session.title} />}
    />
  );
}

interface SessionPageProps {
  readonly appEnvironment: AppEnvironment;
  readonly sessionId: string;
}

export default function SessionPage(props: SessionPageProps) {
  const {appEnvironment, sessionId} = props;

  const {error} = useSession(sessionId);
  const session = useSessionLiveStore((state) => state.sessions[sessionId]?.session);

  if (!session) {
    if (error) {
      return (
        <div className="grid flex-1 place-items-center px-6 py-10">
          <p className="text-sm text-red-300">Unable to load this session.</p>
        </div>
      );
    }

    return <SessionLoading appEnvironment={appEnvironment} sessionId={sessionId} />;
  }

  return <SessionConversation appEnvironment={appEnvironment} session={session} />;
}
