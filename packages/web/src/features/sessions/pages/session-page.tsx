import type {IAgentSessionDetails} from "@pi-desktop/contracts/sessions";
import SessionComposer from "@/features/sessions/components/session-composer";
import SessionTimeline from "@/features/sessions/components/session-timeline";
import {useSession} from "@/features/sessions/hooks/api/use-session";
import {useSessionModels} from "@/features/sessions/hooks/api/use-session-models";
import {useSessionMessageStream} from "@/features/sessions/hooks/use-session-message-stream";
import {modelKey, resolveThinkingLevel, selectionFromModel, selectionKey} from "@/features/sessions/lib/model-selection";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {useSessionModelSelectionStore} from "@/features/sessions/stores/session-model-selection-store";

interface ISessionPageProps {
  sessionId: string;
}

export default function SessionPage(props: ISessionPageProps) {
  const {sessionId} = props;

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

  return <SessionConversation session={sessionQuery.data} />;
}

interface ISessionConversationProps {
  session: IAgentSessionDetails;
}

// Keep the loaded conversation in a child component so hooks below can treat session data as present, not query-optional.
function SessionConversation(props: ISessionConversationProps) {
  const {session} = props;

  // TODO: Investigate why this is called useSessionModels if we're not passing any session specific info to it. Maybe it should be just useModels?
  const {data: models, isPending: modelsPending} = useSessionModels();
  const availableModels = models ?? [];

  const storedSessionModel = useSessionModelSelectionStore((state) => state.selections[session.id]);
  const setSessionModelSelection = useSessionModelSelectionStore((state) => state.setSelection);
  const recordRecentModel = useModelPickerStore((state) => state.recordRecentModel);

  /* 
  TODO: Refactor this logic, it's a bit convoluted. Priority right now is: session local stored model > session provider stored model > first available model.
  Since `storedSessionModel` and `session.model` are model references but model list contains model details, we need to do this back and forth for ensuring everything is mapped.
  I don't like this nested selectionFromModel(resolveThinkingLevel()).
  */
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

  const handleModelChange = (value: string): void => {
    const nextModel = availableModels.find((model) => modelKey(model.providerId, model.id) === value);
    if (!nextModel) return;

    setSessionModelSelection(session.id, selectionFromModel(nextModel, resolveThinkingLevel(nextModel, selectedModelReference?.thinkingLevel)));
    recordRecentModel(value);
  };

  const handleThinkingLevelChange = (value: string): void => {
    if (!selectedModel) return;

    setSessionModelSelection(session.id, selectionFromModel(selectedModel, value));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="-mx-4 flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 pb-3 pt-2.5">
        <h1 className="sticky left-48 min-w-0 truncate text-sm font-medium text-neutral-200">{session.title}</h1>
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
