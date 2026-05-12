import type {IAgentSessionDetails} from "@pi-desktop/contracts/sessions/schemas";
import type {AppEnvironment} from "@/app/app-environment";
import SessionComposer from "@/features/sessions/components/composer/session-composer";
import SessionComposerSkeleton from "@/features/sessions/components/composer/session-composer-skeleton";
import SessionLayout from "@/features/sessions/components/session-layout";
import SessionTimeline from "@/features/sessions/components/session-timeline";
import SessionTitleText from "@/features/sessions/components/session-title-text";
import {useSession} from "@/features/sessions/hooks/api/use-session";
import {useSessionModels} from "@/features/sessions/hooks/api/use-session-models";
import {useCachedSessionTitle} from "@/features/sessions/hooks/use-cached-session-title";
import {useSessionMessageStream} from "@/features/sessions/hooks/use-session-message-stream";
import {modelKey, resolveThinkingLevel, selectionFromModel, selectionKey} from "@/features/sessions/lib/model-picker/model-utils";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {useSessionModelsStore} from "@/features/sessions/stores/session-models-store";

interface ISessionPageProps {
  appEnvironment: AppEnvironment;
  sessionId: string;
}

export default function SessionPage(props: ISessionPageProps) {
  const {appEnvironment, sessionId} = props;

  const sessionQuery = useSession(sessionId);

  if (sessionQuery.isPending) {
    return <SessionLoading appEnvironment={appEnvironment} sessionId={sessionId} />;
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

interface ISessionLoadingProps {
  readonly appEnvironment: AppEnvironment;
  readonly sessionId: string;
}

function SessionLoading(props: ISessionLoadingProps) {
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

  const stream = useSessionMessageStream({
    modelReference: selectedModelReference,
    projectPath: session.projectPath,
    sessionId: session.id,
    sessionTurns: session.turns,
  });

  const isStreaming = stream.streamStatus !== "idle";

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
    <SessionLayout
      appEnvironment={appEnvironment}
      composer={
        <SessionComposer
          disabled={modelsPending || !selectedModelReference}
          models={availableModels}
          modelsLoading={modelsPending}
          onInterrupt={stream.stopStreaming}
          onModelChange={handleModelChange}
          onSubmit={stream.submitMessage}
          onThinkingLevelChange={handleThinkingLevelChange}
          selectedModelKey={selectedModelKey}
          selectedThinkingLevel={selectedModelReference?.thinkingLevel}
          streamStatus={stream.streamStatus}
        />
      }
      timeline={<SessionTimeline isStreaming={isStreaming} items={stream.renderItems} listRef={stream.listRef} streamError={stream.streamError} />}
      title={<SessionTitleText className="block truncate" title={session.title} />}
    />
  );
}
