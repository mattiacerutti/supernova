import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";
import {useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import appIconUrl from "@assets/icon.png";
import AttachmentDropOverlay from "@/features/sessions/components/attachments/attachment-drop-overlay";
import ModelPicker from "@/features/sessions/components/composer/pickers/model-picker";
import ThinkingLevelPicker from "@/features/sessions/components/composer/pickers/thinking-level-picker";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import {useCreateSession} from "@/features/sessions/hooks/api/use-create-session";
import {sessionQueryKey} from "@/features/sessions/hooks/api/use-session";
import {useComposerAttachments} from "@/features/sessions/hooks/use-composer-attachments";
import {useComposerDraft} from "@/features/sessions/hooks/use-composer-draft";
import {useComposerModelSelection} from "@/features/sessions/hooks/use-composer-model-selection";
import {newSessionComposerDraftKey} from "@/features/sessions/stores/composer-drafts-store";
import {useSessionLiveStore} from "@/features/sessions/stores/session-live-store";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";
import {showToast} from "@/components/ui/toast-manager";

interface NewSessionPageProps {
  readonly projectName: string;
  readonly projectPath: string;
}

export default function NewSessionPage(props: NewSessionPageProps) {
  const {projectName, projectPath} = props;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rpcClient = useAgentRpcClient();
  const createSessionMutation = useCreateSession();
  const hydrateSession = useSessionLiveStore((state) => state.hydrateSession);
  const sendMessage = useSessionLiveStore((state) => state.sendMessage);
  const modelSelection = useComposerModelSelection();

  const composerDisabled = createSessionMutation.isPending || modelSelection.isPending || !modelSelection.modelReference;

  const thinkingLevels = modelSelection.selectedModelDetails?.thinkingLevels ?? [];

  const composerDraftKey = newSessionComposerDraftKey(projectPath);
  const composerDraft = useComposerDraft({key: composerDraftKey});
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

  const handleSubmit = (contentParts: readonly UserMessageContentPart[]): void => {
    const modelReference = modelSelection.modelReference;
    if (!modelReference) return;

    createSessionMutation.mutate(
      {projectPath},
      {
        onError: () => {
          showToast("Unable to create the session", "Please try again.");
        },
        onSuccess: (session) => {
          queryClient.setQueryData(sessionQueryKey(session.id), session);
          hydrateSession(session);
          modelSelection.assignToSession(session.id, modelReference);
          sendMessage({contentParts, modelReference, queryClient, rpcClient, sessionId: session.id});
          void navigate({params: {sessionId: session.id}, to: "/session/$sessionId"});
        },
      }
    );
  };

  return (
    <div {...composerAttachments.dropZoneProps} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-16 pt-4">
      <div className="flex h-[min(calc(100svh-1rem),32rem)] w-[min(calc(100vw-2rem),48rem)] flex-col items-center justify-center overflow-visible">
        <div className="mb-8 flex flex-col items-center gap-3">
          <img src={appIconUrl} alt="Supernova" className="h-16 w-auto shrink-0" draggable={false} />
          <h1 className="text-center text-4xl font-normal tracking-tight text-neutral-50">
            What should we build in <i className="text-neutral-400">{projectName}</i>?
          </h1>
        </div>
        <div className="relative w-full">
          {modelSelection.isPending ? (
            <SessionComposerSkeleton />
          ) : (
            <SessionComposer
              key={`${composerDraftKey}:${composerDraft.revision}`}
              attachments={composerAttachments}
              disabled={composerDisabled}
              draft={composerDraft}
              onSubmit={handleSubmit}
              placeholder="Ask anything."
              projectPath={projectPath}
              toolbarControls={
                <div className="flex gap-2">
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
            />
          )}
        </div>
      </div>
      {composerAttachments.isDraggingFiles && <AttachmentDropOverlay />}
    </div>
  );
}
