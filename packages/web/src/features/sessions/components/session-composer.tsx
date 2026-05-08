import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions";
import type {KeyboardEvent} from "react";
import {useState} from "react";
import Icon from "@/components/ui/icon";
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
      <div className="mx-auto max-w-3xl rounded-2xl bg-[#2b2b2b] p-3 ring-1 ring-white/6">
        <textarea
          className="min-h-10 w-full resize-none bg-transparent px-1 text-sm text-neutral-100 outline-none placeholder:text-neutral-500"
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for follow-up changes"
          rows={1}
          value={draft}
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            aria-label="Attach files"
            className="grid size-8 place-items-center rounded-full text-neutral-400 transition hover:bg-white/6 hover:text-neutral-100"
            type="button"
          >
            <Icon name="plus" size="sm" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <div className="relative flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition hover:bg-white/5">
              <span className="truncate text-neutral-100">{selectedModelName}</span>
              <Icon className="shrink-0 text-neutral-500" name="chevron-down" size="xs" />
              <select
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
                disabled={disabled || modelsLoading || models.length === 0}
                onChange={(event) => onModelChange(event.target.value)}
                value={selectedModelKey}
              >
                {modelsLoading && <option value="">Loading models</option>}
                {!modelsLoading && models.length === 0 && <option value="">No model</option>}
                {models.map((model) => (
                  <option key={modelKey(model.providerId, model.id)} value={modelKey(model.providerId, model.id)}>
                    {model.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative flex min-w-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs transition hover:bg-white/5">
              <span className="truncate text-neutral-500">{selectedThinkingLabel}</span>
              <Icon className="shrink-0 text-neutral-500" name="chevron-down" size="xs" />
              <select
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
                disabled={disabled || thinkingLevels.length === 0}
                onChange={(event) => onThinkingLevelChange(event.target.value)}
                value={selectedThinkingLevel ?? ""}
              >
                {thinkingLevels.length === 0 && <option value="">No reasoning</option>}
                {thinkingLevels.map((level) => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              aria-label="Send message"
              className="grid size-9 place-items-center rounded-full bg-neutral-300 text-neutral-950 transition hover:bg-white disabled:cursor-default disabled:bg-white/10 disabled:text-neutral-500"
              disabled={!canSend}
              onClick={handleSubmit}
              type="button"
            >
              <Icon name="send" size="sm" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
