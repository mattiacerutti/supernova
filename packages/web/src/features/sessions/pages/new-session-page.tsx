import {useNavigate} from "@tanstack/react-router";
import {useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import AttachmentDropOverlay from "@/features/sessions/components/attachments/attachment-drop-overlay";
import ModelPicker from "@/features/sessions/components/composer/pickers/model-picker";
import ThinkingLevelPicker from "@/features/sessions/components/composer/pickers/thinking-level-picker";
import {useCreateSession} from "@/features/sessions/hooks/api/use-create-session";
import {useSessionModels} from "@/features/sessions/hooks/api/use-session-models";
import {useComposerAttachments} from "@/features/sessions/hooks/use-composer-attachments";
import {modelKey, resolveThinkingLevel, selectionFromModel} from "@/features/sessions/lib/composer/model-picker/model-utils";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {useSessionModelsStore} from "@/features/sessions/stores/session-models-store";
import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";
import type {UserMessageContentPart} from "@supernova/contracts/sessions/schemas";

interface NewSessionPageProps {
  projectName: string;
  projectPath: string;
}

export default function NewSessionPage(props: NewSessionPageProps) {
  const {projectName, projectPath} = props;

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rpcClient = useAgentRpcClient();
  const createSessionMutation = useCreateSession();

  const {data: models, isPending: modelsPending} = useSessionModels();
  const availableModels = models ?? [];

  const startStream = useSessionStreamStore((state) => state.startStream);
  const setSessionModel = useSessionModelsStore((state) => state.setSessionModel);
  const recordRecentModel = useModelPickerStore((state) => state.recordRecentModel);
  const setLastThinkingLevel = useModelPickerStore((state) => state.setLastThinkingLevel);
  const recentModelKeys = useModelPickerStore((state) => state.recentModelKeys);
  const lastThinkingLevel = useModelPickerStore((state) => state.lastThinkingLevel);

  const [selectedModelKey, setSelectedModelKey] = useState("");
  const [selectedThinkingLevel, setSelectedThinkingLevel] = useState<string | undefined>(undefined);

  const defaultModelKey =
    recentModelKeys.find((key) => availableModels.some((model) => modelKey(model.providerId, model.id) === key)) ??
    (availableModels[0] ? modelKey(availableModels[0].providerId, availableModels[0].id) : "");

  const resolvedModelKey = selectedModelKey || defaultModelKey;
  const selectedModel = availableModels.find((model) => modelKey(model.providerId, model.id) === resolvedModelKey);
  const resolvedThinkingLevel = selectedModel ? resolveThinkingLevel(selectedModel, selectedThinkingLevel ?? lastThinkingLevel) : undefined;

  const thinkingLevels = selectedModel?.thinkingLevels ?? [];
  const selectedThinkingLabel = thinkingLevels.find((level) => level.value === resolvedThinkingLevel)?.label ?? "Reasoning";

  const composerDisabled = createSessionMutation.isPending || modelsPending || !selectedModel;
  const imageSupported = selectedModel?.capabilities.images === true;
  const composerAttachments = useComposerAttachments({disabled: composerDisabled, imageSupported});

  const handleModelChange = (value: string): void => {
    const nextModel = availableModels.find((model) => modelKey(model.providerId, model.id) === value);
    if (!nextModel) return;

    const currentLevel = selectedThinkingLevel ?? lastThinkingLevel;
    const nextThinkingLevel = resolveThinkingLevel(nextModel, currentLevel);
    if (!nextModel.capabilities.images) composerAttachments.removeUnsupportedImages();
    setSelectedModelKey(value);
    setSelectedThinkingLevel(nextThinkingLevel);
    recordRecentModel(value);
  };

  const handleThinkingLevelChange = (value: string): void => {
    setSelectedThinkingLevel(value);
    setLastThinkingLevel(value);
  };

  const handleSubmit = (contentParts: readonly UserMessageContentPart[]): void => {
    if (!selectedModel) return;

    createSessionMutation.mutate(
      {projectPath},
      {
        onSuccess: (session) => {
          const modelReference = selectionFromModel(selectedModel, resolvedThinkingLevel);
          setSessionModel(session.id, modelReference);
          recordRecentModel(resolvedModelKey);
          setLastThinkingLevel(resolvedThinkingLevel);
          startStream({contentParts, model: modelReference, projectPath, queryClient, rpcClient, sessionId: session.id, sessionTurns: session.turns});
          void navigate({params: {sessionId: session.id}, to: "/session/$sessionId"});
        },
      }
    );
  };

  return (
    <div {...composerAttachments.dropZoneProps} className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16 pt-10">
      <div className="w-full max-w-3xl">
        <h1 className="mb-10 text-center text-4xl font-normal tracking-tight text-neutral-50">
          What should we build in <i>{projectName}</i>?
        </h1>
        {createSessionMutation.error && <p className="mb-4 text-center text-sm text-red-300">Unable to create the session.</p>}
        {modelsPending ? (
          <SessionComposerSkeleton />
        ) : (
          <SessionComposer.Root attachments={composerAttachments} disabled={composerDisabled} onSubmit={handleSubmit} projectPath={projectPath}>
            <SessionComposer.Attachments />
            <SessionComposer.Input placeholder="Ask anything." />
            <SessionComposer.Toolbar>
              <SessionComposer.AttachButton />
              <SessionComposer.ActionGroup>
                <div className="flex gap-2">
                  <ModelPicker selectedModel={selectedModel} disabled={composerDisabled} models={availableModels} onModelChange={handleModelChange} />
                  {thinkingLevels.length > 0 && (
                    <ThinkingLevelPicker
                      disabled={composerDisabled}
                      onThinkingLevelChange={handleThinkingLevelChange}
                      selectedThinkingLabel={selectedThinkingLabel}
                      selectedThinkingLevel={resolvedThinkingLevel}
                      thinkingLevels={thinkingLevels}
                    />
                  )}
                </div>
                <SessionComposer.SubmitButton />
              </SessionComposer.ActionGroup>
            </SessionComposer.Toolbar>
          </SessionComposer.Root>
        )}
      </div>
      {composerAttachments.isDraggingFiles && <AttachmentDropOverlay />}
    </div>
  );
}
