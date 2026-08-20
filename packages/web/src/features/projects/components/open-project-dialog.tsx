import type {Ref} from "react";
import {useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import SearchableList from "@/features/projects/components/searchable-list";
import {useCreateFolder} from "@/features/projects/hooks/api/use-create-folder";
import {listFolderSuggestionsQueryOptions, useListFolderSuggestions} from "@/features/projects/hooks/api/use-list-folder-suggestions";
import {
  formatSuggestionPath,
  getProjectBrowseDirectoryPath,
  getProjectBrowseLeafPath,
  getProjectBrowseParentPath,
  hasTrailingProjectPathSeparator,
  resolveProjectBrowsePath,
  withTrailingProjectPathSeparator,
} from "@/features/projects/lib/project-paths";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";

type ProjectSearchRow =
  | {readonly id: "recent-projects" | "open-project"; readonly title: string; readonly type: "header"}
  | {readonly kind: "folder" | "parent" | "recent"; readonly path: string; readonly type: "suggestion"};

interface SuggestionItemProps {
  highlighted: boolean;
  homePath: string | undefined;
  kind: "folder" | "parent" | "recent";
  onAutocomplete: (path: string) => void;
  path: string;
  ref: Ref<HTMLDivElement>;
}

function SuggestionItem(props: SuggestionItemProps) {
  const {highlighted, homePath, kind, onAutocomplete, path, ref} = props;
  const {name, parent, suffix} = kind === "parent" ? {name: "..", parent: "", suffix: ""} : formatSuggestionPath(path, homePath);

  return (
    <div className={cn("group flex items-center gap-1 rounded-xl corner-superellipse/1.3", highlighted && "bg-overlay-hover")} ref={ref}>
      <Button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left" onClick={() => onAutocomplete(path)} variant="bare">
        <Icon className="shrink-0 text-ink-muted" name={kind === "parent" ? "corner-left-up" : "folder"} size="sm" />
        <span className="min-w-0 flex-1 truncate text-[15px]">
          {parent && <span className="text-ink-muted">{parent}</span>}
          <span className="text-ink">{name}</span>
          <span className="text-ink-muted">{suffix}</span>
        </span>
      </Button>
    </div>
  );
}

interface OpenProjectDialogProps {
  onClose: () => void;
  onOpenProject: (projectPath: string) => void;
  open: boolean;
}

export default function OpenProjectDialog(props: OpenProjectDialogProps) {
  const {onClose, onOpenProject, open} = props;
  const [activeRowIndex, setActiveRowIndex] = useState(0);
  const [browseGeneration, setBrowseGeneration] = useState(0);
  const [folderCreationDialogOpen, setFolderCreationDialogOpen] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const queryClient = useQueryClient();
  const browseDirectoryPath = getProjectBrowseDirectoryPath(projectPath);
  const browseLeafPath = getProjectBrowseLeafPath(projectPath);
  const browseParentPath = getProjectBrowseParentPath(browseDirectoryPath);
  const suggestionsQuery = useListFolderSuggestions(browseDirectoryPath);
  const createFolderMutation = useCreateFolder();
  const storedProjects = useProjectsStore((state) => state.projects);

  const currentResult = suggestionsQuery.data;
  const recentProjects = storedProjects.slice(0, 5);
  const lowerBrowseLeafPath = browseLeafPath.toLowerCase();
  const showHiddenFolders = browseLeafPath.startsWith(".");
  const suggestedFolders = (currentResult?.suggestions ?? []).filter(
    (folder) => folder.name.toLowerCase().startsWith(lowerBrowseLeafPath) && (showHiddenFolders || !folder.name.startsWith("."))
  );
  const exactFolder = browseLeafPath.length > 0 ? suggestedFolders.find((folder) => folder.name === browseLeafPath) : undefined;
  const resolvedProjectPath = currentResult
    ? hasTrailingProjectPathSeparator(projectPath)
      ? currentResult.queryPath
      : (exactFolder?.path ?? resolveProjectBrowsePath(currentResult.queryPath, browseLeafPath))
    : undefined;
  const resolvedProjectPathType = hasTrailingProjectPathSeparator(projectPath) ? currentResult?.queryPathType : exactFolder ? "directory" : "missing";
  const folderCreationPath = resolvedProjectPathType === "missing" ? resolvedProjectPath : undefined;
  const isShowingDefaults = projectPath.trim().length === 0;
  const recentRows: ProjectSearchRow[] = isShowingDefaults ? recentProjects.map((project) => ({kind: "recent", path: project.path, type: "suggestion"})) : [];
  const folderRows: ProjectSearchRow[] = suggestedFolders.map((folder) => ({kind: "folder", path: folder.path, type: "suggestion"}));
  const rows: ProjectSearchRow[] = [
    ...(recentRows.length > 0 ? [{id: "recent-projects", title: "Recent projects", type: "header"} satisfies ProjectSearchRow, ...recentRows] : []),
    ...(isShowingDefaults ? [{id: "open-project", title: "Open project", type: "header"} satisfies ProjectSearchRow] : []),
    ...(browseParentPath ? [{kind: "parent", path: browseParentPath, type: "suggestion"} satisfies ProjectSearchRow] : []),
    ...folderRows,
  ];
  const canSubmitPath =
    projectPath.trim().length > 0 &&
    !!resolvedProjectPath &&
    resolvedProjectPathType !== "file" &&
    !suggestionsQuery.isFetching &&
    !createFolderMutation.isPending &&
    !folderCreationDialogOpen;

  const handleActiveRowIndexChange = (updater: number | ((current: number) => number)): void => {
    const nextIndex = typeof updater === "function" ? updater(activeRowIndex) : updater;
    const row = rows[nextIndex];
    setActiveRowIndex(nextIndex);
    if (row?.type === "suggestion" && row.kind === "folder") {
      void queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(withTrailingProjectPathSeparator(row.path)));
    }
  };

  const handlePathChange = (value: string): void => {
    const parentPath = getProjectBrowseParentPath(getProjectBrowseDirectoryPath(value));
    if (parentPath) void queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(parentPath));
    setProjectPath(value);
    setActiveRowIndex(0);
  };

  const handleAutocomplete = (path: string): void => {
    const nextPath = withTrailingProjectPathSeparator(path);
    void queryClient.prefetchQuery(listFolderSuggestionsQueryOptions(nextPath));
    setProjectPath(nextPath);
    setActiveRowIndex(0);
    setBrowseGeneration((generation) => generation + 1);
  };

  const handleOpenPath = (): void => {
    if (!canSubmitPath || !resolvedProjectPath) return;

    if (resolvedProjectPathType === "directory") {
      onOpenProject(resolvedProjectPath);
      return;
    }

    createFolderMutation.reset();
    setFolderCreationDialogOpen(true);
  };

  const handleConfirmCreateFolder = async (): Promise<void> => {
    if (!folderCreationPath) return;

    try {
      const result = await createFolderMutation.mutateAsync({path: folderCreationPath});
      setFolderCreationDialogOpen(false);
      onOpenProject(result.path);
    } catch {
      // The mutation state renders the error message in the confirmation dialog.
    }
  };

  const handleDialogOpenChangeComplete = (nextOpen: boolean): void => {
    if (nextOpen) return;

    createFolderMutation.reset();
    setActiveRowIndex(0);
    setBrowseGeneration(0);
    setFolderCreationDialogOpen(false);
    setProjectPath("");
  };

  const listStatus = suggestionsQuery.isError && <p className="px-3 py-2 text-sm text-danger-ink">Unable to search folders.</p>;

  return (
    <>
      <Dialog
        onOpenChange={(nextOpen) => {
          if (!nextOpen) onClose();
        }}
        onOpenChangeComplete={handleDialogOpenChangeComplete}
        open={open}
        title="Open project"
      >
        <SearchableList
          activeIndex={activeRowIndex}
          key={browseGeneration}
          getItemKey={(row) => (row.type === "header" ? row.id : `${row.kind}-${row.path}`)}
          isItemSelectable={(row) => row.type === "suggestion"}
          items={rows}
          listStatus={listStatus}
          onActiveIndexChange={handleActiveRowIndexChange}
          onSubmit={handleOpenPath}
          onTab={(row) => {
            if (row.type === "suggestion") handleAutocomplete(row.path);
          }}
          renderInput={({onKeyDown}) => (
            <div className="shrink-0 pb-2 pt-4">
              <div className="flex items-center gap-2 rounded-xl bg-overlay-hover px-3 py-0.5 text-ink-muted ring-1 ring-border-muted focus-within:text-ink focus-within:ring-border">
                <Icon name="search" size="sm" />
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
                  onChange={(event) => handlePathChange(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search folders"
                  value={projectPath}
                />

                <Button
                  disabled={!canSubmitPath}
                  className={cn("size-8", resolvedProjectPathType === "file" && "pointer-events-none invisible")}
                  onClick={handleOpenPath}
                  shape="icon"
                  size="sm"
                  title="Open project path"
                  variant="ghost"
                >
                  <Icon className="text-ink-muted" name="arrow-right" size="sm" />
                </Button>
              </div>
            </div>
          )}
          renderItem={(row, _index, renderProps) =>
            row.type === "header" ? (
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-ink-faint">{row.title}</p>
            ) : (
              <SuggestionItem
                highlighted={renderProps.highlighted}
                homePath={currentResult?.homePath}
                kind={row.kind}
                onAutocomplete={handleAutocomplete}
                path={row.path}
                ref={renderProps.ref}
              />
            )
          }
        />
      </Dialog>

      <Dialog
        containerClassName="h-auto w-[min(calc(100vw-1rem),28rem)]"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setFolderCreationDialogOpen(false);
        }}
        open={folderCreationDialogOpen}
        title="Create folder?"
      >
        <div className="flex flex-col gap-5 pb-5 pt-3">
          <p className="text-sm leading-6 text-ink-muted">
            The folder <span className="text-ink">{folderCreationPath}</span> does not exist. Create it and open it as a project?
          </p>

          {createFolderMutation.error && <p className="text-sm text-danger-ink">Unable to create this folder.</p>}

          <div className="flex justify-end gap-2">
            <Button
              className="rounded-xl px-3 py-2 text-sm text-ink-muted hover:bg-overlay-hover hover:text-ink-strong"
              onClick={() => setFolderCreationDialogOpen(false)}
              variant="bare"
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-overlay-pressed px-3 py-2 text-sm text-ink-strong hover:bg-overlay-strong disabled:hover:bg-overlay-pressed"
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
