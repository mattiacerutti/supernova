import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions";
import type {KeyboardEvent} from "react";
import {useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import ModelPicker from "@/features/sessions/components/model-picker";
import ThinkingLevelPicker from "@/features/sessions/components/thinking-level-picker";
import {modelKey} from "@/features/sessions/lib/model-selection";

interface ISessionComposerProps {
  disabled: boolean;
  modelsLoading: boolean;
  models: readonly IAgentModelDetails[];
  onModelChange: (value: string) => void;
  onSubmit: (message: string) => void;
  onThinkingLevelChange: (value: string) => void;
  selectedModelKey: string;
  selectedThinkingLevel: string | undefined;
}

export default function SessionComposer(props: ISessionComposerProps) {
  const {disabled, models, modelsLoading, onModelChange, onSubmit, onThinkingLevelChange, selectedModelKey, selectedThinkingLevel} = props;
  const [draft, setDraft] = useState("");

  const canSend = draft.trim().length > 0 && !disabled;
  const selectedModel = models.find((model) => modelKey(model.providerId, model.id) === selectedModelKey);
  const selectedModelName = modelsLoading ? "Loading models" : (selectedModel?.name ?? "No model");
  const thinkingLevels = selectedModel?.thinkingLevels ?? [];
  const selectedThinkingLabel = thinkingLevels.find((level) => level.value === selectedThinkingLevel)?.label ?? "No reasoning";

  const handleSubmit = (): void => {
    if (!canSend) return;
    onSubmit(draft.trim());
    setDraft("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    handleSubmit();
  };

  return (
    <div className="px-4 pb-4 md:px-6">
      <div className="mx-auto max-w-3xl rounded-3xl bg-[#2b2b2b] p-3 ring-1 ring-white/6 shadow-md">
        <textarea
          className="min-h-10 w-full resize-none bg-transparent p-1 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for follow-up changes"
          rows={1}
          value={draft}
        />

        <div className="flex items-center justify-between gap-2">
          <IconButton
            label="Attach files"
            className="grid size-8 place-items-center rounded-full text-neutral-400 transition hover:bg-white/6 hover:text-neutral-100"
            size="none"
            variant="ghost"
          >
            <Icon name="plus" size="sm" />
          </IconButton>

          <div className="flex min-w-0 items-center gap-4">
            <div className="flex gap-2">
              <ModelPicker
                disabled={disabled}
                models={models}
                modelsLoading={modelsLoading}
                onModelChange={onModelChange}
                selectedModelKey={selectedModelKey}
                selectedModelName={selectedModelName}
              />

              <ThinkingLevelPicker
                disabled={disabled}
                onThinkingLevelChange={onThinkingLevelChange}
                selectedThinkingLabel={selectedThinkingLabel}
                selectedThinkingLevel={selectedThinkingLevel}
                thinkingLevels={thinkingLevels}
              />
            </div>

            <IconButton
              label="Send message"
              className="grid size-9 place-items-center rounded-full bg-neutral-300 text-neutral-950 transition hover:bg-white disabled:cursor-default disabled:bg-white/10 disabled:text-neutral-500"
              disabled={!canSend}
              onClick={handleSubmit}
              size="none"
              variant="bare"
            >
              <Icon name="send" size="md" />
            </IconButton>
          </div>
        </div>
      </div>
    </div>
  );
}
