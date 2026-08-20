import type {ModelDetails} from "@supernova/contracts/sessions/schemas";
import type {MouseEvent} from "react";
import {useRef, useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuLabel} from "@/components/ui/menu";
import SearchField from "@/components/ui/search-field";
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
      className="w-[min(20rem,calc(100vw-2rem))] p-0"
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
      <SearchField
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="Search models"
        value={search}
      />

      <div className="relative">
        <div className="scroll-fade-b max-h-60 overflow-y-auto p-1 [overflow-anchor:none]" ref={scrollContainerRef}>
          {sections.length === 0 && <div className="px-3 py-7 text-center text-sm text-ink-muted">No models found</div>}
          {sections.map((section) => (
            <div className="pb-1" key={section.title}>
              <MenuLabel className="pb-1 text-xs">{section.title}</MenuLabel>
              <div className="space-y-0.5">
                {section.models.map((model) => {
                  const value = modelKey(model.providerId, model.id);
                  const selected = value === selectedModelKey;
                  const favorite = favoriteKeySet.has(value);
                  const showProvider = section.title === "Favorites" || section.title === "Recents";

                  return (
                    <div
                      className={cn(
                        "group flex cursor-pointer items-center gap-1.5 rounded-xl corner-superellipse/1.3 pr-2 transition-colors",
                        selected ? "bg-surface-control hover:bg-surface-popover" : "hover:bg-overlay-pressed"
                      )}
                      key={`${section.title}-${value}`}
                    >
                      <Button className="flex min-w-0 flex-1 items-baseline gap-1.5 px-2 py-1.5 text-left" onClick={() => handleModelSelect(value)} variant="bare">
                        <span className={cn("truncate text-sm leading-5 text-ink", selected && "font-medium")}>{model.name}</span>
                        {showProvider && <span className="shrink-0 text-[11px] text-ink-faint">{model.providerName}</span>}
                      </Button>
                      <IconButton
                        label={favorite ? "Remove from favorites" : "Add to favorites"}
                        className={cn(
                          "grid size-6 place-items-center rounded-lg corner-superellipse/1.3 text-ink-faint opacity-0 transition hover:text-ink-strong group-hover:opacity-100",
                          favorite && "text-ink-muted opacity-100"
                        )}
                        onClick={(event) => handleFavoriteClick(event, value)}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        size="none"
                        variant="primary"
                      >
                        <Icon className={favorite ? "fill-current [stroke:none]" : undefined} name={favorite ? "star-filled" : "star"} size="xs" />
                      </IconButton>
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
