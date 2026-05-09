import type {IAgentModelDetails} from "@pi-desktop/contracts/sessions";
import type {MouseEvent} from "react";
import {useRef, useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu from "@/components/ui/menu";
import {getModelPickerSections} from "@/features/sessions/lib/model-picker";
import {modelKey} from "@/features/sessions/lib/model-selection";
import {useModelPickerStore} from "@/features/sessions/stores/model-picker-store";
import {cn} from "@/lib/cn";

interface IModelPickerProps {
  disabled: boolean;
  models: readonly IAgentModelDetails[];
  modelsLoading: boolean;
  onModelChange: (value: string) => void;
  selectedModelKey: string;
  selectedModelName: string;
}

export default function ModelPicker(props: IModelPickerProps) {
  const {disabled, models, modelsLoading, onModelChange, selectedModelKey, selectedModelName} = props;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const favoriteModelKeys = useModelPickerStore((state) => state.favoriteModelKeys);
  const recentModelKeys = useModelPickerStore((state) => state.recentModelKeys);
  const toggleFavoriteModel = useModelPickerStore((state) => state.toggleFavoriteModel);

  const sections = getModelPickerSections({favoriteModelKeys, models, recentModelKeys, search});
  const favoriteKeySet = new Set(favoriteModelKeys);

  const handleOpenChange = (nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (!nextOpen) setSearch("");
  };

  const handleModelSelect = (value: string): void => {
    onModelChange(value);
    setOpen(false);
    setSearch("");
  };

  const handleFavoriteClick = (event: MouseEvent<HTMLButtonElement>, value: string): void => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavoriteModel(value);
  };

  return (
    <Menu
      align="end"
      className="w-[min(20rem,calc(100vw-2rem))] overflow-hidden bg-neutral-800 backdrop-blur-none"
      onOpenChange={handleOpenChange}
      open={open}
      sideOffset={10}
      trigger={(triggerProps) => (
        <Button
          {...triggerProps}
          className="flex min-w-0 items-center gap-1.5  px-2.5 py-1 text-xs"
          disabled={disabled || modelsLoading || models.length === 0}
          type="button"
          variant="primary"
        >
          <span className="truncate">{selectedModelName}</span>
          <Icon className="shrink-0 text-neutral-500" name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel="Select model"
    >
      <div className="p-2">
        <div className="flex items-center gap-2 rounded-xl bg-white/3 px-3 py-2 text-neutral-500 ring-1 ring-white/5 focus-within:text-neutral-300 focus-within:ring-white/10">
          <Icon name="search" size="sm" />
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            placeholder="Search models"
            value={search}
          />
        </div>
      </div>

      <div className="relative">
        <div className="max-h-60 overflow-y-auto [overflow-anchor:none]" ref={scrollContainerRef}>
          {modelsLoading && <div className="px-3 py-7 text-center text-sm text-neutral-500">Loading models</div>}
          {!modelsLoading && sections.length === 0 && <div className="px-3 py-7 text-center text-sm text-neutral-500">No models found</div>}
          {!modelsLoading &&
            sections.map((section) => (
              <div key={section.title}>
                <div className="sticky top-0 z-10 mt-2 bg-neutral-800 p-2 px-2 text-sm font-medium text-neutral-500">{section.title}</div>
                <div className="space-y-0.5 pb-3">
                  {section.models.map((model) => {
                    const value = modelKey(model.providerId, model.id);
                    const selected = value === selectedModelKey;
                    const favorite = favoriteKeySet.has(value);
                    const showProvider = section.title === "Favorites" || section.title === "Recents";

                    return (
                      <div
                        className="group flex cursor-pointer items-center rounded-xl corner-superellipse/1.3 transition-colors hover:bg-white/6"
                        key={`${section.title}-${value}`}
                      >
                        <Button className="min-w-0 flex-1 px-2 py-2 text-left" onClick={() => handleModelSelect(value)} variant="bare">
                          <div className="truncate text-sm font-medium text-neutral-200">{model.name}</div>
                          {showProvider && <div className="truncate text-xs text-neutral-600">{model.providerName}</div>}
                        </Button>
                        <IconButton
                          label={favorite ? "Remove from favorites" : "Add to favorites"}
                          className={cn(
                            "mr-2 grid size-7 place-items-center rounded-xl corner-superellipse/1.3 text-neutral-500 opacity-0 transition hover:bg-white/8 hover:text-neutral-100 group-hover:opacity-100",
                            favorite && "text-neutral-200 opacity-100"
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
                        {selected && <Icon className="mr-2 text-neutral-300" name="check" size="xs" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-linear-to-t from-neutral-800 to-transparent" />
      </div>
    </Menu>
  );
}
