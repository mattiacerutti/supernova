import type {ModelDetails} from "@supernova/contracts/sessions/schemas";
import type {MouseEvent} from "react";
import {useRef, useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu from "@/components/ui/menu";
import {getModelPickerSections} from "@/features/sessions/lib/composer/model-picker/model-picker";
import {modelKey} from "@/features/sessions/lib/composer/model-picker/model-utils";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {cn} from "@/lib/cn";

interface ModelPickerProps {
  selectedModel: ModelDetails | undefined;
  disabled: boolean;
  models: readonly ModelDetails[];
  onModelChange: (value: string) => void;
}

export default function ModelPicker(props: ModelPickerProps) {
  const {disabled, models, onModelChange, selectedModel} = props;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const favoriteModelKeys = useModelPickerStore((state) => state.favoriteModelKeys);
  const recentModelKeys = useModelPickerStore((state) => state.recentModelKeys);
  const toggleFavoriteModel = useModelPickerStore((state) => state.toggleFavoriteModel);

  const sections = getModelPickerSections({favoriteModelKeys, models, recentModelKeys, search});
  const favoriteKeySet = new Set(favoriteModelKeys);

  const selectedModelKey = selectedModel ? modelKey(selectedModel.providerId, selectedModel.id) : undefined;

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) setSearch("");
    setOpen(nextOpen);
  };

  const handleModelSelect = (value: string): void => {
    onModelChange(value);
    setOpen(false);
  };

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>, value: string): void => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavoriteModel(value);
  };

  return (
    <Menu
      align="end"
      className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden bg-surface-contrast backdrop-blur-none"
      onOpenChange={handleOpenChange}
      open={open}
      sideOffset={10}
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="flex min-w-0 items-center gap-1.5  px-2.5 py-1 text-xs" disabled={disabled || models.length === 0} type="button" variant="primary">
          <span className="truncate">{selectedModel?.name ?? "Select model"}</span>
          <Icon className="shrink-0 text-ink-muted" name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel="Select model"
    >
      <div className="p-2">
        <div className="flex items-center gap-2 rounded-xl bg-overlay-hover px-3 py-2 text-ink-muted ring-1 ring-border-muted focus-within:text-ink focus-within:ring-border">
          <Icon name="search" size="sm" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder="Search models"
            value={search}
          />
        </div>
      </div>

      <div className="relative">
        <div className="scroll-fade-b max-h-60 overflow-y-auto [overflow-anchor:none]" ref={scrollContainerRef}>
          {sections.length === 0 && <div className="px-3 py-7 text-center text-sm text-ink-muted">No models found</div>}
          {sections.map((section) => (
            <div key={section.title}>
              <div className="sticky top-0 z-10 mt-2 bg-surface-contrast p-2 px-2 text-sm font-medium text-ink-muted">{section.title}</div>
              <div className="space-y-0.5 pb-3">
                {section.models.map((model) => {
                  const value = modelKey(model.providerId, model.id);
                  const selected = value === selectedModelKey;
                  const favorite = favoriteKeySet.has(value);
                  const showProvider = section.title === "Favorites" || section.title === "Recents";

                  return (
                    <div className="group flex cursor-pointer items-center rounded-xl corner-superellipse/1.3 transition-colors hover:bg-overlay-hover" key={`${section.title}-${value}`}>
                      <Button className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => handleModelSelect(value)} variant="bare">
                        <div className="truncate text-sm font-medium text-ink">{model.name}</div>
                        {showProvider && <div className="truncate text-xs text-ink-faint">{model.providerName}</div>}
                      </Button>
                      <IconButton
                        label={favorite ? "Remove from favorites" : "Add to favorites"}
                        className={cn(
                          "mr-2 grid size-7 place-items-center rounded-xl corner-superellipse/1.3 text-ink-muted opacity-0 transition hover:bg-overlay-pressed hover:text-ink-strong group-hover:opacity-100",
                          favorite && "text-ink opacity-100"
                        )}
                        onClick={(event) => handleFavoriteClick(event, value)}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        size="none"
                        variant="primary"
                      >
                        <Icon className={favorite ? "fill-current" : undefined} name={favorite ? "star-filled" : "star"} size="xs" />
                      </IconButton>
                      {selected && <Icon className="mr-2 text-ink" name="check" size="xs" />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Menu>
  );
}
