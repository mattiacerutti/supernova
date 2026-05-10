import {useNavigate} from "@tanstack/react-router";
import {useQueryClient} from "@tanstack/react-query";
import {useState} from "react";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import {useCreateSession} from "@/features/sessions/hooks/api/use-create-session";
import {useSessionModels} from "@/features/sessions/hooks/api/use-session-models";
import {modelKey, resolveThinkingLevel, selectionFromModel} from "@/features/sessions/lib/model-picker/model-utils";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {useSessionModelsStore} from "@/features/sessions/stores/session-models-store";
import {useSessionStreamStore} from "@/features/sessions/stores/session-stream-store";
import {useAgentRpcClient} from "@/rpc/use-agent-rpc-client";

interface INewSessionPageProps {
  projectName: string;
  projectPath: string;
}

export default function NewSessionPage(props: INewSessionPageProps) {
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

  const handleModelChange = (value: string): void => {
    const nextModel = availableModels.find((model) => modelKey(model.providerId, model.id) === value);
    if (!nextModel) return;

    const currentLevel = selectedThinkingLevel ?? lastThinkingLevel;
    const nextThinkingLevel = resolveThinkingLevel(nextModel, currentLevel);
    setSelectedModelKey(value);
    setSelectedThinkingLevel(nextThinkingLevel);
    recordRecentModel(value);
  };

  const handleThinkingLevelChange = (value: string): void => {
    setSelectedThinkingLevel(value);
    setLastThinkingLevel(value);
  };

  const handleSubmit = (message: string): void => {
    if (!selectedModel) return;

    createSessionMutation.mutate(
      {projectPath},
      {
        onSuccess: (session) => {
          const modelReference = selectionFromModel(selectedModel, resolvedThinkingLevel);
          setSessionModel(session.id, modelReference);
          recordRecentModel(resolvedModelKey);
          setLastThinkingLevel(resolvedThinkingLevel);
          startStream({message, model: modelReference, projectPath, queryClient, rpcClient, sessionId: session.id, sessionTurns: session.turns});
          void navigate({params: {sessionId: session.id}, to: "/session/$sessionId"});
        },
      }
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-16 pt-10">
      <div className="w-full max-w-3xl">
        <h1 className="mb-10 text-center text-4xl font-normal tracking-tight text-neutral-50">
          What should we build in <i>{projectName}</i>?
        </h1>
        {createSessionMutation.error && <p className="mb-4 text-center text-sm text-red-300">Unable to create the session.</p>}
        <SessionComposer
          disabled={createSessionMutation.isPending || modelsPending || !selectedModel}
          models={availableModels}
          modelsLoading={modelsPending}
          onModelChange={handleModelChange}
          onSubmit={handleSubmit}
          onThinkingLevelChange={handleThinkingLevelChange}
          placeholder="Ask anything."
          selectedModelKey={resolvedModelKey}
          selectedThinkingLevel={resolvedThinkingLevel}
        />
      </div>
    </div>
  );
}
