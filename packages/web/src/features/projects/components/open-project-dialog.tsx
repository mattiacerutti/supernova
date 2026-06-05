import type {Dispatch, KeyboardEvent, SetStateAction} from "react";
import {useState} from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import {useCreateFolder} from "@/features/projects/hooks/api/use-create-folder";
import {useListFolderSuggestions} from "@/features/projects/hooks/api/use-list-folder-suggestions";
import {formatSuggestionPath, withTrailingProjectPathSeparator} from "@/features/projects/lib/project-paths";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";

interface SuggestionItemProps {
  highlighted: boolean;
  homePath: string | undefined;
  onAutocomplete: (path: string) => void;
  onHoverEnd: () => void;
  onPointerHover: () => void;
  path: string;
  shouldScrollIntoView: boolean;
}

function SuggestionItem(props: SuggestionItemProps) {
  const {highlighted, homePath, onAutocomplete, onHoverEnd, onPointerHover, path, shouldScrollIntoView} = props;
  const {name, parent, suffix} = formatSuggestionPath(path, homePath);

  const handleAutocomplete = (): void => {
    onAutocomplete(path);
  };

  return (
    <div
      className={cn("group flex items-center gap-1 rounded-xl corner-superellipse/1.3", highlighted && "bg-white/6")}
      onMouseLeave={onHoverEnd}
      onPointerMove={onPointerHover}
      ref={(element) => {
        if (shouldScrollIntoView && element) {
          element.scrollIntoView({block: "center"});
        }
      }}
    >
      <Button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left" onClick={handleAutocomplete} variant="bare">
        <Icon className="shrink-0 text-neutral-500" name="folder" size="sm" />
        <span className="min-w-0 flex-1 truncate text-[15px]">
          {parent && <span className="text-neutral-500">{parent}</span>}
          <span className="text-neutral-200">{name}</span>
          <span className="text-neutral-500">{suffix}</span>
        </span>
      </Button>
    </div>
  );
}

interface OpenProjectDialogProps {
  activeSuggestionIndex: number;
  onActiveSuggestionIndexChange: Dispatch<SetStateAction<number>>;
  onClose: () => void;
  onOpenProject: (projectPath: string) => void;
  onProjectPathChange: (projectPath: string) => void;
  open: boolean;
  projectPath: string;
}

export default function OpenProjectDialog(props: OpenProjectDialogProps) {
  const {activeSuggestionIndex, onActiveSuggestionIndexChange, onClose, onOpenProject, onProjectPathChange, open, projectPath} = props;
  const [folderCreationConfirmation, setFolderCreationConfirmation] = useState<{open: boolean; path: string} | null>(null);
  const [hoveredSuggestionIndex, setHoveredSuggestionIndex] = useState<number | null>(null);
  const [selectionSource, setSelectionSource] = useState<"keyboard" | "mouse">("keyboard");

  const suggestionsQuery = useListFolderSuggestions(projectPath);
  const createFolderMutation = useCreateFolder();

  const pathStatus = suggestionsQuery.data?.query === projectPath ? suggestionsQuery.data : undefined;
  const homePath = pathStatus?.homePath;

  const storedProjects = useProjectsStore((state) => state.projects);
  const recentProjects = storedProjects.slice(0, 5);
  const suggestedFolders = pathStatus?.suggestions ?? [];

  const isShowingDefaults = projectPath.trim().length === 0;
  const suggestions = [
    ...(isShowingDefaults ? recentProjects.map((project) => ({kind: "recent" as const, path: project.path})) : []),
    ...suggestedFolders.map((folder) => ({kind: "folder" as const, path: folder.path})),
  ].map((suggestion, index) => ({...suggestion, index}));

  const highlightedIndex = suggestions.length === 0 ? -1 : Math.min(activeSuggestionIndex, suggestions.length - 1);
  const activeSuggestion = highlightedIndex >= 0 ? suggestions[highlightedIndex] : undefined;
  const visibleHighlightIndex = hoveredSuggestionIndex ?? highlightedIndex;

  const canSubmitPath =
    projectPath.trim().length > 0 &&
    !!pathStatus &&
    pathStatus.queryPathType !== "file" &&
    !suggestionsQuery.isFetching &&
    !createFolderMutation.isPending &&
    !folderCreationConfirmation?.open;

  const handlePathChange = (value: string): void => {
    createFolderMutation.reset();
    setHoveredSuggestionIndex(null);
    setSelectionSource("keyboard");
    onProjectPathChange(value);
    onActiveSuggestionIndexChange(0);
  };

  const handleSuggestionHoverStart = (index: number): void => {
    setHoveredSuggestionIndex(index);
    setSelectionSource("mouse");
    onActiveSuggestionIndexChange(index);
  };

  const handleAutocomplete = (path: string): void => {
    handlePathChange(withTrailingProjectPathSeparator(path));
  };

  const handleOpenPath = async (): Promise<void> => {
    if (!canSubmitPath || !pathStatus) return;

    if (pathStatus.queryPathType === "directory") {
      onOpenProject(pathStatus.queryPath);
      return;
    }

    createFolderMutation.reset();
    setFolderCreationConfirmation({open: true, path: pathStatus.queryPath});
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length > 0) {
      event.preventDefault();
      setHoveredSuggestionIndex(null);
      setSelectionSource("keyboard");
      onActiveSuggestionIndexChange((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const selectedIndex = Math.max(0, Math.min(current, suggestions.length - 1));
        return (selectedIndex + delta + suggestions.length) % suggestions.length;
      });
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void handleOpenPath();
      return;
    }

    if (event.key === "Tab" && activeSuggestion) {
      event.preventDefault();
      handleAutocomplete(activeSuggestion.path);
    }
  };

  const handleConfirmCreateFolder = async (): Promise<void> => {
    if (!folderCreationConfirmation) return;

    try {
      const result = await createFolderMutation.mutateAsync({path: folderCreationConfirmation.path});
      setFolderCreationConfirmation((confirmation) => (confirmation ? {...confirmation, open: false} : null));
      onOpenProject(result.path);
    } catch {
      // The mutation state renders the error message in the confirmation dialog.
    }
  };

  const handleCancelCreateFolder = (): void => {
    createFolderMutation.reset();
    setFolderCreationConfirmation((confirmation) => (confirmation ? {...confirmation, open: false} : null));
  };

  const handleDialogOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) onClose();
  };

  const handleCreateFolderDialogOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) handleCancelCreateFolder();
  };

  const isLoading = suggestionsQuery.isPending && !suggestionsQuery.data;
  const hasError = !!suggestionsQuery.error;
  const isEmpty = !isLoading && !hasError && suggestedFolders.length === 0 && !isShowingDefaults;

  return (
    <>
      <Dialog onOpenChange={handleDialogOpenChange} open={open} title="Open project">
        <div className="shrink-0 pt-4">
          <div className="flex items-center gap-2 rounded-xl bg-white/3 px-3 py-1.5 text-neutral-500 ring-1 ring-white/5 focus-within:text-neutral-300 focus-within:ring-white/10">
            <Icon name="search" size="sm" />
            <input
              autoFocus
              className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
              onChange={(event) => handlePathChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search folders"
              value={projectPath}
            />

            <Button
              disabled={!canSubmitPath}
              className={cn("size-8", pathStatus?.queryPathType === "file" && "pointer-events-none invisible")}
              onClick={() => void handleOpenPath()}
              shape="icon"
              size="sm"
              title="Open project path"
              variant="ghost"
            >
              <Icon className="text-neutral-400" name="arrow-right" size="sm" />
            </Button>
          </div>
        </div>

        <div className="-ml-3 -mr-5 min-h-0 flex-1 overflow-y-auto py-2">
          {isLoading && <p className="px-3 py-2 text-sm text-neutral-600">Searching folders...</p>}
          {hasError && <p className="px-3 py-2 text-sm text-red-400">Unable to search folders.</p>}
          {isEmpty && <p className="px-3 py-2 text-sm text-neutral-600">No matching subfolders.</p>}

          {isShowingDefaults && recentProjects.length > 0 && (
            <div className="pb-2">
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">Recent projects</p>
              {suggestions
                .filter((s) => s.kind === "recent")
                .map((s) => (
                  <SuggestionItem
                    highlighted={s.index === visibleHighlightIndex}
                    homePath={homePath}
                    key={`recent-${s.path}`}
                    onAutocomplete={handleAutocomplete}
                    onHoverEnd={() => setHoveredSuggestionIndex(null)}
                    onPointerHover={() => handleSuggestionHoverStart(s.index)}
                    path={s.path}
                    shouldScrollIntoView={selectionSource === "keyboard" && hoveredSuggestionIndex === null && s.index === highlightedIndex}
                  />
                ))}
            </div>
          )}

          {isShowingDefaults && <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">Open project</p>}

          {suggestions
            .filter((s) => s.kind === "folder")
            .map((s) => (
              <SuggestionItem
                highlighted={s.index === visibleHighlightIndex}
                homePath={homePath}
                key={`folder-${s.path}`}
                onAutocomplete={handleAutocomplete}
                onHoverEnd={() => setHoveredSuggestionIndex(null)}
                onPointerHover={() => handleSuggestionHoverStart(s.index)}
                path={s.path}
                shouldScrollIntoView={selectionSource === "keyboard" && hoveredSuggestionIndex === null && s.index === highlightedIndex}
              />
            ))}
        </div>
      </Dialog>

      <Dialog
        containerClassName="h-auto w-[min(calc(100vw-1rem),28rem)]"
        onOpenChange={handleCreateFolderDialogOpenChange}
        open={folderCreationConfirmation?.open ?? false}
        title="Create folder?"
      >
        <div className="flex flex-col gap-5 pb-5 pt-3">
          <p className="text-sm leading-6 text-neutral-400">
            The folder <span className="text-neutral-200">{folderCreationConfirmation?.path}</span> does not exist. Create it and open it as a project?
          </p>

          {createFolderMutation.error && <p className="text-sm text-red-400">Unable to create this folder.</p>}

          <div className="flex justify-end gap-2">
            <Button className="rounded-xl px-3 py-2 text-sm text-neutral-400 hover:bg-white/7 hover:text-neutral-100" onClick={handleCancelCreateFolder} variant="bare">
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-white/10 px-3 py-2 text-sm text-neutral-100 hover:bg-white/15 disabled:hover:bg-white/10"
              disabled={createFolderMutation.isPending}
              onClick={() => void handleConfirmCreateFolder()}
              variant="bare"
            >
              Create folder
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
