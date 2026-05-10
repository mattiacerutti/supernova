import type {Dispatch, KeyboardEvent, SetStateAction} from "react";
import {useDeferredValue} from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import {useListFolderSuggestions} from "@/features/projects/hooks/api/use-list-folder-suggestions";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";

function formatSuggestionPath(displayPath: string, homePath: string | undefined): {parent: string; name: string; suffix: string} {
  const trimmedPath = displayPath.replace(/\/$/, "");

  const normalizedHomePath = homePath?.replace(/\/$/, "");
  const displayTrimmedPath =
    normalizedHomePath && (trimmedPath === normalizedHomePath || trimmedPath.startsWith(`${normalizedHomePath}/`))
      ? `~${trimmedPath.slice(normalizedHomePath.length)}`
      : trimmedPath;
  const lastSlashIndex = displayTrimmedPath.lastIndexOf("/");

  if (lastSlashIndex <= 0) {
    return {name: displayTrimmedPath, parent: "", suffix: "/"};
  }

  return {
    name: displayTrimmedPath.slice(lastSlashIndex + 1),
    parent: `${displayTrimmedPath.slice(0, lastSlashIndex + 1)}`,
    suffix: "/",
  };
}

interface IOpenProjectDialogProps {
  activeSuggestionIndex: number;
  onActiveSuggestionIndexChange: Dispatch<SetStateAction<number>>;
  onClose: () => void;
  onOpenProject: (projectPath: string) => void;
  onProjectPathChange: (projectPath: string) => void;
  open: boolean;
  projectPath: string;
}

interface ISuggestionItemProps {
  highlighted: boolean;
  homePath: string | undefined;
  onAutocomplete: (path: string) => void;
  onOpen: (path: string) => void;
  path: string;
}

function SuggestionItem(props: ISuggestionItemProps) {
  const {highlighted, homePath, onAutocomplete, onOpen, path} = props;
  const {name, parent, suffix} = formatSuggestionPath(path, homePath);

  return (
    <div
      className={cn("group flex w-full items-center gap-1 rounded-xl corner-superellipse/1.3 hover:bg-white/6", highlighted && "bg-white/6")}
      ref={(element) => {
        if (highlighted && element) {
          element.scrollIntoView({block: "center"});
        }
      }}
    >
      <Button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left" onClick={() => onAutocomplete(path)} variant="bare">
        <Icon className="shrink-0 text-neutral-500" name="folder" size="sm" />
        <span className="min-w-0 flex-1 truncate text-[15px]">
          {parent && <span className="text-neutral-500">{parent}</span>}
          <span className="text-neutral-200">{name}</span>
          <span className="text-neutral-500">{suffix}</span>
        </span>
      </Button>
      <Button className="mr-1 px-2 py-1 text-neutral-500 hover:text-neutral-100" onClick={() => onOpen(path)} variant="ghost">
        ↵
      </Button>
    </div>
  );
}

export default function OpenProjectDialog(props: IOpenProjectDialogProps) {
  const {activeSuggestionIndex, onActiveSuggestionIndexChange, onClose, onOpenProject, onProjectPathChange, open, projectPath} = props;

  const deferredProjectPath = useDeferredValue(projectPath);
  const suggestionsQuery = useListFolderSuggestions(deferredProjectPath);
  const homePath = suggestionsQuery.data?.homePath;

  const storedProjects = useProjectsStore((state) => state.projects);
  const recentProjects = storedProjects.slice(0, 5);
  const suggestedFolders = suggestionsQuery.data?.suggestions ?? [];

  const isShowingDefaults = projectPath.trim().length === 0;

  const suggestions = (() => {
    const result: Array<{index: number; kind: "recent" | "folder"; path: string}> = [];
    let index = 0;

    if (isShowingDefaults) {
      for (const project of recentProjects) {
        result.push({index: index++, kind: "recent", path: project.path});
      }
    }

    for (const folder of suggestedFolders) {
      result.push({index: index++, kind: "folder", path: folder.path});
    }

    return result;
  })();

  const highlightedIndex = suggestions.length === 0 ? -1 : Math.min(activeSuggestionIndex, suggestions.length - 1);
  const activeSuggestion = highlightedIndex >= 0 ? suggestions[highlightedIndex] : undefined;

  const handlePathChange = (value: string): void => {
    onProjectPathChange(value);
    onActiveSuggestionIndexChange(0);
  };

  const handleAutocomplete = (path: string): void => {
    handlePathChange(path.endsWith("/") ? path : `${path}/`);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestions.length > 0) {
      event.preventDefault();
      onActiveSuggestionIndexChange((current) => {
        const delta = event.key === "ArrowDown" ? 1 : -1;
        return (current + delta + suggestions.length) % suggestions.length;
      });
      return;
    }

    if (event.key === "Enter" && activeSuggestion) {
      event.preventDefault();
      onOpenProject(activeSuggestion.path);
      return;
    }

    if (event.key === "Tab" && activeSuggestion) {
      event.preventDefault();
      handleAutocomplete(activeSuggestion.path);
    }
  };

  const handleDialogOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) onClose();
  };

  const isLoading = suggestionsQuery.isPending && !suggestionsQuery.data;
  const hasError = !!suggestionsQuery.error;
  const isEmpty = !isLoading && !hasError && suggestedFolders.length === 0 && !isShowingDefaults;

  return (
    <Dialog onOpenChange={handleDialogOpenChange} open={open} title="Open project">
      <div className="shrink-0 pt-4">
        <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
          <Icon className="text-neutral-500" name="search" size="md" />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-200 outline-none placeholder:text-neutral-600"
            onChange={(event) => handlePathChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search folders"
            value={projectPath}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
        {isLoading && <p className="px-3 py-2 text-sm text-neutral-600">Searching folders...</p>}
        {hasError && <p className="px-3 py-2 text-sm text-red-400">Unable to search folders.</p>}
        {isEmpty && <p className="px-3 py-2 text-sm text-neutral-600">No matching folders.</p>}

        {isShowingDefaults && recentProjects.length > 0 && (
          <div className="pb-2">
            <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">Recent projects</p>
            {suggestions
              .filter((s) => s.kind === "recent")
              .map((s) => (
                <SuggestionItem
                  highlighted={s.index === highlightedIndex}
                  homePath={homePath}
                  key={`recent-${s.path}`}
                  onAutocomplete={handleAutocomplete}
                  onOpen={onOpenProject}
                  path={s.path}
                />
              ))}
          </div>
        )}

        {isShowingDefaults && <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">Open project</p>}

        {suggestions
          .filter((s) => s.kind === "folder")
          .map((s) => (
            <SuggestionItem
              highlighted={s.index === highlightedIndex}
              homePath={homePath}
              key={`folder-${s.path}`}
              onAutocomplete={handleAutocomplete}
              onOpen={onOpenProject}
              path={s.path}
            />
          ))}
      </div>
    </Dialog>
  );
}
