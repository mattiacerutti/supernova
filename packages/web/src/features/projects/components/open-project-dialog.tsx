import {useDeferredValue, useEffect, useRef, useState} from "react";
import type {KeyboardEvent} from "react";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import {useListFolderSuggestions} from "@/features/projects/hooks/api/use-list-folder-suggestions";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";

function formatSuggestionPath(displayPath: string): {parent: string; name: string; suffix: string} {
  const trimmedPath = displayPath.replace(/\/$/, "");
  const lastSlashIndex = trimmedPath.lastIndexOf("/");

  if (lastSlashIndex <= 0) {
    return {name: trimmedPath, parent: "", suffix: "/"};
  }

  return {
    name: trimmedPath.slice(lastSlashIndex + 1),
    parent: `${trimmedPath.slice(0, lastSlashIndex + 1)}`,
    suffix: "/",
  };
}

interface IOpenProjectDialogProps {
  onClose: () => void;
  onOpenProject: (projectPath: string) => void;
}

export default function OpenProjectDialog(props: IOpenProjectDialogProps) {
  const {onClose, onOpenProject} = props;

  const [projectPath, setProjectPath] = useState("");
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);

  const suggestionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const deferredProjectPath = useDeferredValue(projectPath);
  const suggestionsQuery = useListFolderSuggestions(deferredProjectPath);
  const suggestedFolders = suggestionsQuery.data?.suggestions ?? [];

  const storedProjects = useProjectsStore((state) => state.projects);
  const recentProjects = storedProjects.slice(0, 5);

  const showingDefaultSuggestions = projectPath.trim().length === 0;

  const suggestionRows = [...recentProjects, ...suggestedFolders];
  const highlightedSuggestionIndex = suggestionRows.length === 0 ? -1 : Math.min(activeSuggestionIndex, suggestionRows.length - 1);
  const activeSuggestion = highlightedSuggestionIndex >= 0 ? suggestionRows[highlightedSuggestionIndex] : undefined;

  useEffect(() => {
    suggestionRefs.current[highlightedSuggestionIndex]?.scrollIntoView({block: "center"});
  }, [highlightedSuggestionIndex]);

  const handleSuggestionClick = (suggestionPath: string): void => {
    onOpenProject(suggestionPath);
  };

  const handleProjectPathChange = (value: string): void => {
    setProjectPath(value);
    setActiveSuggestionIndex(0);
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if ((event.key === "ArrowDown" || event.key === "ArrowUp") && suggestionRows.length > 0) {
      event.preventDefault();
      setActiveSuggestionIndex((currentIndex) => {
        const nextIndex = event.key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
        return (nextIndex + suggestionRows.length) % suggestionRows.length;
      });
      return;
    }

    if (event.key === "Enter" && activeSuggestion) {
      event.preventDefault();
      onOpenProject(activeSuggestion.path);
      return;
    }

    if (event.key !== "Tab" || !activeSuggestion) return;

    event.preventDefault();
    handleProjectPathChange(activeSuggestion.path.endsWith("/") ? activeSuggestion.path : `${activeSuggestion.path}/`);
  };

  const hasContent = suggestionsQuery.data != null || suggestionsQuery.isLoading || suggestionsQuery.error != null;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open title="Open project">
      <div className="shrink-0 px-5 pt-4">
        <div className="flex items-center gap-2.5 border-b border-white/6 pb-3">
          <Icon className="text-neutral-500" name="search" size="md" />
          <input
            autoFocus
            className="min-w-0 flex-1 bg-transparent text-[15px] text-neutral-100 outline-none placeholder:text-neutral-600"
            onChange={(event) => handleProjectPathChange(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Search folders"
            value={projectPath}
          />
        </div>
      </div>

      {hasContent && (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {suggestionsQuery.isLoading && <p className="px-3 py-2 text-sm text-neutral-600">Searching folders...</p>}
          {suggestionsQuery.error && <p className="px-3 py-2 text-sm text-red-400">Unable to search folders.</p>}
          {!suggestionsQuery.isLoading && !suggestionsQuery.error && suggestionsQuery.data?.suggestions.length === 0 && (
            <p className="px-3 py-2 text-sm text-neutral-600">No matching folders.</p>
          )}

          {showingDefaultSuggestions && recentProjects.length > 0 && (
            <div className="pb-2">
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">Recent projects</p>
              {recentProjects.map((project, index) => {
                const {name, parent, suffix} = formatSuggestionPath(project.path);
                const highlighted = index === highlightedSuggestionIndex;

                return (
                  <button
                    className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/6", highlighted && "bg-white/6")}
                    key={project.id}
                    onClick={() => handleSuggestionClick(project.path)}
                    ref={(element) => {
                      suggestionRefs.current[index] = element;
                    }}
                    type="button"
                  >
                    <Icon className="shrink-0 text-neutral-500" name="folder" size="sm" />
                    <span className="min-w-0 flex-1 truncate text-[15px]">
                      {parent && <span className="text-neutral-500">{parent}</span>}
                      <span className="text-neutral-200">{name}</span>
                      <span className="text-neutral-500">{suffix}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {showingDefaultSuggestions && <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">Open project</p>}

          {suggestedFolders.map((suggestion, index) => {
            const {name, parent, suffix} = formatSuggestionPath(suggestion.path);
            const highlighted = recentProjects.length + index === highlightedSuggestionIndex;

            return (
              <button
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/6", highlighted && "bg-white/6")}
                key={suggestion.path}
                onClick={() => handleSuggestionClick(suggestion.path)}
                ref={(element) => {
                  suggestionRefs.current[recentProjects.length + index] = element;
                }}
                type="button"
              >
                <Icon className="shrink-0 text-neutral-500" name="folder" size="sm" />
                <span className="min-w-0 flex-1 truncate text-[15px]">
                  {parent && <span className="text-neutral-500">{parent}</span>}
                  <span className="text-neutral-200">{name}</span>
                  <span className="text-neutral-500">{suffix}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Dialog>
  );
}
