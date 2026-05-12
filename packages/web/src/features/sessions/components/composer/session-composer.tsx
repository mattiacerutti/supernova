import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions/schemas";
import type {KeyboardEvent} from "react";
import {useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ModelPicker from "@/features/sessions/components/composer/pickers/model-picker";
import ThinkingLevelPicker from "@/features/sessions/components/composer/pickers/thinking-level-picker";
import SessionComposerShell from "@/features/sessions/components/composer/session-composer-shell";
import {modelKey} from "@/features/sessions/lib/model-picker/model-utils";

interface ISessionComposerProps {
  disabled: boolean;
  modelsLoading: boolean;
  models: readonly IAgentModelDetails[];
  onInterrupt?: () => void;
  onModelChange: (value: string) => void;
  onSubmit: (message: string) => void;
  onThinkingLevelChange: (value: string) => void;
  placeholder?: string;
  selectedModelKey: string;
  selectedThinkingLevel: string | undefined;
  streamStatus?: "idle" | "streaming" | "stopping";
}

export default function SessionComposer(props: ISessionComposerProps) {
  const {
    disabled,
    models,
    modelsLoading,
    onInterrupt,
    onModelChange,
    onSubmit,
    onThinkingLevelChange,
    placeholder = "Ask for follow-up changes",
    selectedModelKey,
    selectedThinkingLevel,
    streamStatus = "idle",
  } = props;
  const [draft, setDraft] = useState("");

  const isStreaming = streamStatus !== "idle";
  const inputDisabled = disabled || isStreaming;
  const canSend = draft.trim().length > 0 && !disabled && !isStreaming;
  const canInterrupt = streamStatus === "streaming";
  const primaryActionDisabled = isStreaming ? !canInterrupt : !canSend;
  const primaryActionLabel = isStreaming ? (streamStatus === "stopping" ? "Stopping stream" : "Stop streaming") : "Send message";
  const selectedModel = models.find((model) => modelKey(model.providerId, model.id) === selectedModelKey);
  const selectedModelName = modelsLoading ? "Loading models" : (selectedModel?.name ?? "No model");
  const thinkingLevels = selectedModel?.thinkingLevels ?? [];
  const selectedThinkingLabel = thinkingLevels.find((level) => level.value === selectedThinkingLevel)?.label ?? "No reasoning";

  const handleSubmit = (): void => {
    if (!canSend) return;
    onSubmit(draft.trim());
    setDraft("");
  };

  const handlePrimaryAction = (): void => {
    if (isStreaming) {
      if (canInterrupt) onInterrupt?.();
      return;
    }

    handleSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    handleSubmit();
  };

  return (
    <SessionComposerShell
      attachmentDisabled={inputDisabled}
      controls={
        <div className="flex gap-2">
          <ModelPicker
            disabled={inputDisabled}
            models={models}
            modelsLoading={modelsLoading}
            onModelChange={onModelChange}
            selectedModelKey={selectedModelKey}
            selectedModelName={selectedModelName}
          />

          <ThinkingLevelPicker
            disabled={inputDisabled}
            onThinkingLevelChange={onThinkingLevelChange}
            selectedThinkingLabel={selectedThinkingLabel}
            selectedThinkingLevel={selectedThinkingLevel}
            thinkingLevels={thinkingLevels}
          />
        </div>
      }
      primaryAction={
        <IconButton
          label={primaryActionLabel}
          className="grid size-9 place-items-center rounded-full bg-neutral-300 text-neutral-950 transition hover:bg-white disabled:cursor-default disabled:bg-white/10 disabled:text-neutral-500"
          disabled={primaryActionDisabled}
          onClick={handlePrimaryAction}
          size="none"
          variant="bare"
        >
          <Icon name={isStreaming ? "stop" : "send"} size="md" />
        </IconButton>
      }
    >
      <textarea
        className="max-h-48 min-h-10 w-full resize-none overflow-y-auto bg-transparent p-1 text-sm text-neutral-200 outline-none field-sizing-content placeholder:text-md placeholder:font-light placeholder:text-white/25"
        disabled={inputDisabled}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        value={draft}
      />
    </SessionComposerShell>
  );
}
