import type {IAgentSessionDetails} from "@pi-desktop/contracts/sessions";
import type {AppEnvironment} from "@/app/app-environment";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionTimeline from "@/features/sessions/components/session-timeline";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {useSession} from "@/features/sessions/hooks/api/use-session";
import {useSessionModels} from "@/features/sessions/hooks/api/use-session-models";
import {useSessionMessageStream} from "@/features/sessions/hooks/use-session-message-stream";
import {modelKey, resolveThinkingLevel, selectionFromModel, selectionKey} from "@/features/sessions/lib/model-picker/model-utils";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {useSessionModelsStore} from "@/features/sessions/stores/session-models-store";
import {cn} from "@/lib/cn";

interface ISessionPageProps {
  appEnvironment: AppEnvironment;
  sessionId: string;
}

export default function SessionPage(props: ISessionPageProps) {
  const {appEnvironment, sessionId} = props;

  const sessionQuery = useSession(sessionId);

  if (sessionQuery.isPending) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-10">
        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span className="size-4 animate-spin rounded-full border border-neutral-600 border-t-neutral-200" />
          Loading session
        </div>
      </div>
    );
  }

  if (sessionQuery.error || !sessionQuery.data) {
    return (
      <div className="grid flex-1 place-items-center px-6 py-10">
        <p className="rounded-lg border border-red-500/15 bg-red-500/10 px-3 py-2 text-xs text-red-300">Unable to load this session.</p>
      </div>
    );
  }

  return <SessionConversation appEnvironment={appEnvironment} session={sessionQuery.data} />;
}

interface ISessionConversationProps {
  appEnvironment: AppEnvironment;
  session: IAgentSessionDetails;
}

function SessionConversation(props: ISessionConversationProps) {
  const {appEnvironment, session} = props;

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

  const titleOffset = appEnvironment === "mac" ? "left-48" : appEnvironment === "web" ? "left-12" : "left-20";

  const stream = useSessionMessageStream({
    modelReference: selectedModelReference,
    projectPath: session.projectPath,
    sessionId: session.id,
    sessionTurns: session.turns,
  });

  const handleModelChange = (value: string): void => {
    const nextModel = availableModels.find((model) => modelKey(model.providerId, model.id) === value);
    if (!nextModel) return;

    const currentLevel = selectedModelReference?.thinkingLevel ?? lastThinkingLevel;
    const nextThinkingLevel = resolveThinkingLevel(nextModel, currentLevel);
    const nextSelection = selectionFromModel(nextModel, nextThinkingLevel);

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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="-mx-4 flex min-w-0 shrink-0 items-center justify-between border-b border-neutral-800 px-4 pb-3 pt-2.5">
        <h1 className={cn("sticky min-w-0 max-w-xs truncate text-sm font-medium text-neutral-200", titleOffset)}>
          <SessionTitleText className="block truncate" title={session.title} />
        </h1>
      </header>

      <SessionTimeline isStreaming={stream.isStreaming} items={stream.renderItems} listRef={stream.listRef} streamError={stream.streamError} />

      <SessionComposer
        disabled={stream.isStreaming || modelsPending || !selectedModelReference}
        models={availableModels}
        modelsLoading={modelsPending}
        onModelChange={handleModelChange}
        onSubmit={stream.submitMessage}
        onThinkingLevelChange={handleThinkingLevelChange}
        selectedModelKey={selectedModelKey}
        selectedThinkingLevel={selectedModelReference?.thinkingLevel}
      />
    </div>
  );
}
