import type {Session} from "@supernova/contracts/sessions/schemas";
import type {AppEnvironment} from "@/app/app-environment";
import ModelPicker from "@/features/sessions/components/composer/pickers/model-picker";
import ThinkingLevelPicker from "@/features/sessions/components/composer/pickers/thinking-level-picker";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import UndoneTurnsDrawer from "@/features/sessions/components/composer/undone-turns-drawer";
import SessionActionsMenu from "@/features/sessions/components/session-actions-menu";
import SessionLayout from "@/features/sessions/components/session-layout";
import SessionTimeline from "@/features/sessions/components/timeline/session-timeline";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {useSession} from "@/features/sessions/hooks/api/use-session";
import {useSessionModels} from "@/features/sessions/hooks/api/use-session-models";
import {useComposerAttachments} from "@/features/sessions/hooks/use-composer-attachments";
import {useCachedSessionTitle} from "@/features/sessions/hooks/use-cached-session-title";
import {useRenameSession as useRenameSessionMutation} from "@/features/sessions/hooks/api/use-rename-session";
import {useSessionTimeline} from "@/features/sessions/hooks/use-session-timeline";
import {modelKey, resolveThinkingLevel, selectionFromModel, selectionKey} from "@/features/sessions/lib/composer/model-picker/model-utils";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {useSessionModelsStore} from "@/features/sessions/stores/session-models-store";
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
  appEnvironment: AppEnvironment;
  session: Session;
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
  const {data: models, isPending: modelsPending} = useSessionModels();
  const availableModels = models ?? [];

  const storedSessionModel = useSessionModelsStore((state) => state.models[session.id]);
  const setSessionModel = useSessionModelsStore((state) => state.setSessionModel);
  const recordRecentModel = useModelPickerStore((state) => state.recordRecentModel);
  const setLastThinkingLevel = useModelPickerStore((state) => state.setLastThinkingLevel);
  const lastThinkingLevel = useModelPickerStore((state) => state.lastThinkingLevel);

  const selectedModelKey =
    selectionKey(storedSessionModel) || selectionKey(session.model) || (availableModels[0] ? modelKey(availableModels[0].providerId, availableModels[0].id) : "");
  const selectedModel = availableModels.find((model) => modelKey(model.providerId, model.id) === selectedModelKey);

  const selectedThinkingLevel = storedSessionModel?.thinkingLevel ?? session.model?.thinkingLevel;
  const selectedModelReference = selectedModel ? selectionFromModel(selectedModel, resolveThinkingLevel(selectedModel, selectedThinkingLevel)) : undefined;

  const thinkingLevels = selectedModel?.thinkingLevels ?? [];
  const selectedThinkingLabel = thinkingLevels.find((level) => level.value === selectedModelReference?.thinkingLevel)?.label ?? "Reasoning";

  const imageSupported = selectedModel?.capabilities.images === true;
  const nextUndoneTurn = session.undoneTurns[0];
  const nextUndoneContentParts = nextUndoneTurn?.userMessage.contentParts ?? [];

  const stream = useSessionTimeline({
    modelReference: selectedModelReference,
    sessionId: session.id,
    sessionTurns: session.turns,
  });

  const composerDisabled = modelsPending || !selectedModelReference;
  const composerActionDisabled = composerDisabled || stream.streamStatus !== "idle";

  const composerAttachments = useComposerAttachments({
    disabled: composerDisabled,
    imageSupported,
    initialContentParts: nextUndoneContentParts,
  });

  const handleModelChange = (value: string): void => {
    const nextModel = availableModels.find((model) => modelKey(model.providerId, model.id) === value);
    if (!nextModel) return;

    const currentLevel = selectedModelReference?.thinkingLevel ?? lastThinkingLevel;
    const nextThinkingLevel = resolveThinkingLevel(nextModel, currentLevel);
    const nextSelection = selectionFromModel(nextModel, nextThinkingLevel);

    if (!nextModel.capabilities.images) composerAttachments.removeUnsupportedImages();
    setSessionModel(session.id, nextSelection);
    recordRecentModel(value);
  };

  const handleThinkingLevelChange = (value: string): void => {
    if (!selectedModel) return;

    const nextSelection = selectionFromModel(selectedModel, value);
    setSessionModel(session.id, nextSelection);
    setLastThinkingLevel(value);
  };

  return (
    <SessionLayout
      appEnvironment={appEnvironment}
      attachmentDropOverlayVisible={composerAttachments.isDraggingFiles}
      attachmentDropZoneProps={composerAttachments.dropZoneProps}
      composer={
        modelsPending ? (
          <SessionComposerSkeleton />
        ) : (
          <SessionComposer.Root
            attachments={composerAttachments}
            disabled={composerDisabled}
            initialContentParts={nextUndoneContentParts}
            onInterrupt={stream.stopStreaming}
            onSubmit={stream.submitMessage}
            projectPath={session.projectPath}
            slashCommandActions={stream.slashCommandActions}
            streamStatus={stream.streamStatus}
            topExtension={<UndoneTurnsDrawer disabled={composerActionDisabled} onRevertToMessage={stream.revertToMessage} turns={session.undoneTurns} />}
          >
            <SessionComposer.Attachments />
            <SessionComposer.Input />
            <SessionComposer.Toolbar>
              <SessionComposer.AttachButton />
              <SessionComposer.ActionGroup>
                <div className="flex gap-2">
                  <ModelPicker selectedModel={selectedModel} disabled={composerActionDisabled} models={availableModels} onModelChange={handleModelChange} />
                  {thinkingLevels.length > 0 && (
                    <ThinkingLevelPicker
                      disabled={composerActionDisabled}
                      onThinkingLevelChange={handleThinkingLevelChange}
                      selectedThinkingLabel={selectedThinkingLabel}
                      selectedThinkingLevel={selectedModelReference?.thinkingLevel}
                      thinkingLevels={thinkingLevels}
                    />
                  )}
                </div>
                <SessionComposer.SubmitButton />
              </SessionComposer.ActionGroup>
            </SessionComposer.Toolbar>
          </SessionComposer.Root>
        )
      }
      timeline={
        <SessionTimeline
          compacting={stream.streamStatus === "compacting"}
          forceFollow={stream.streamStatus === "checkpoint-navigating"}
          isStreaming={stream.streamStatus === "streaming" || stream.streamStatus === "compacting"}
          items={stream.committedTimelineItems}
          liveItems={stream.liveTimelineItems}
          onRevertToMessage={stream.revertToMessage}
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
  appEnvironment: AppEnvironment;
  sessionId: string;
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
