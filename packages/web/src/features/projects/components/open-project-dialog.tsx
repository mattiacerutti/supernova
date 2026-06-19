import type {Ref} from "react";
import {useState} from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import SearchableList from "@/features/projects/components/searchable-list";
import {useCreateFolder} from "@/features/projects/hooks/api/use-create-folder";
import {useListFolderSuggestions} from "@/features/projects/hooks/api/use-list-folder-suggestions";
import {formatSuggestionPath, withTrailingProjectPathSeparator} from "@/features/projects/lib/project-paths";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";

type ProjectSearchRow =
  | {readonly id: "recent-projects" | "open-project"; readonly title: string; readonly type: "header"}
  | {readonly kind: "folder" | "recent"; readonly path: string; readonly type: "suggestion"};

interface SuggestionItemProps {
  highlighted: boolean;
  homePath: string | undefined;
  onAutocomplete: (path: string) => void;
  path: string;
  ref: Ref<HTMLDivElement>;
}

function SuggestionItem(props: SuggestionItemProps) {
  const {highlighted, homePath, onAutocomplete, path, ref} = props;
  const {name, parent, suffix} = formatSuggestionPath(path, homePath);

  return (
    <div className={cn("group flex items-center gap-1 rounded-xl corner-superellipse/1.3", highlighted && "bg-white/6")} ref={ref}>
      <Button className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 px-3 py-2 text-left" onClick={() => onAutocomplete(path)} variant="bare">
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
  onClose: () => void;
  onOpenProject: (projectPath: string) => void;
  open: boolean;
}

export default function OpenProjectDialog(props: OpenProjectDialogProps) {
  const {onClose, onOpenProject, open} = props;
  const [activeRow, setActiveRow] = useState({index: 0, query: ""});
  const [folderCreationDialogOpen, setFolderCreationDialogOpen] = useState(false);
  const [projectPath, setProjectPath] = useState("");
  const [queryPath, setQueryPath] = useState("");
  const suggestionsQuery = useListFolderSuggestions(queryPath);
  const createFolderMutation = useCreateFolder();

  const displayStatus = suggestionsQuery.data;
  const displayedQuery = displayStatus?.query ?? "";
  const currentProjectPath = displayStatus?.query === queryPath ? queryPath : projectPath;
  const activeRowIndex = activeRow.query === displayedQuery ? activeRow.index : 0;
  const pathStatus = displayStatus?.query === currentProjectPath ? displayStatus : undefined;
  const folderCreationPath = pathStatus?.queryPath;
  const homePath = displayStatus?.homePath;

  const storedProjects = useProjectsStore((state) => state.projects);
  const recentProjects = storedProjects.slice(0, 5);
  const suggestedFolders = displayStatus?.suggestions ?? [];

  const isShowingDefaults = currentProjectPath.trim().length === 0;
  const recentRows: ProjectSearchRow[] = isShowingDefaults ? recentProjects.map((project) => ({kind: "recent", path: project.path, type: "suggestion"})) : [];
  const folderRows: ProjectSearchRow[] = suggestedFolders.map((folder) => ({kind: "folder", path: folder.path, type: "suggestion"}));
  const rows: ProjectSearchRow[] = [
    ...(recentRows.length > 0 ? [{id: "recent-projects", title: "Recent projects", type: "header"} satisfies ProjectSearchRow, ...recentRows] : []),
    ...(isShowingDefaults ? [{id: "open-project", title: "Open project", type: "header"} satisfies ProjectSearchRow] : []),
    ...folderRows,
  ];

  const canSubmitPath =
    currentProjectPath.trim().length > 0 &&
    !!pathStatus &&
    pathStatus.queryPathType !== "file" &&
    !suggestionsQuery.isFetching &&
    !createFolderMutation.isPending &&
    !folderCreationDialogOpen;

  const handleActiveRowIndexChange = (updater: number | ((current: number) => number)): void => {
    setActiveRow((current) => ({index: typeof updater === "function" ? updater(current.query === displayedQuery ? current.index : 0) : updater, query: displayedQuery}));
  };

  const handlePathChange = (value: string): void => {
    createFolderMutation.reset();
    setProjectPath(value);
    setQueryPath(value);
  };

  const handleAutocomplete = (path: string): void => {
    createFolderMutation.reset();
    setQueryPath(withTrailingProjectPathSeparator(path));
  };

  const handleOpenPath = (): void => {
    if (!canSubmitPath || !pathStatus) return;

    if (pathStatus.queryPathType === "directory") {
      onOpenProject(pathStatus.queryPath);
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
    setActiveRow({index: 0, query: ""});
    setFolderCreationDialogOpen(false);
    setProjectPath("");
    setQueryPath("");
  };

  const isLoading = suggestionsQuery.isPending && !suggestionsQuery.data;
  const hasError = !!suggestionsQuery.error;
  const isEmpty = !isLoading && !suggestionsQuery.isFetching && !hasError && suggestedFolders.length === 0 && !isShowingDefaults;
  const listStatus = (
    <>
      {isLoading && <p className="px-3 py-2 text-sm text-neutral-600">Searching folders...</p>}
      {hasError && <p className="px-3 py-2 text-sm text-red-400">Unable to search folders.</p>}
      {isEmpty && <p className="px-3 py-2 text-sm text-neutral-600">No matching subfolders.</p>}
    </>
  );

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
          key={displayedQuery}
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
              <div className="flex items-center gap-2 rounded-xl bg-white/3 px-3 py-0.5 text-neutral-500 ring-1 ring-white/5 focus-within:text-neutral-300 focus-within:ring-white/10">
                <Icon name="search" size="sm" />
                <input
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent text-sm text-neutral-200 outline-none placeholder:text-neutral-600"
                  onChange={(event) => handlePathChange(event.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Search folders"
                  value={currentProjectPath}
                />

                <Button
                  disabled={!canSubmitPath}
                  className={cn("size-8", pathStatus?.queryPathType === "file" && "pointer-events-none invisible")}
                  onClick={handleOpenPath}
                  shape="icon"
                  size="sm"
                  title="Open project path"
                  variant="ghost"
                >
                  <Icon className="text-neutral-400" name="arrow-right" size="sm" />
                </Button>
              </div>
            </div>
          )}
          renderItem={(row, _index, renderProps) =>
            row.type === "header" ? (
              <p className="px-3 pb-1 pt-2 text-xs font-medium text-neutral-600">{row.title}</p>
            ) : (
              <SuggestionItem highlighted={renderProps.highlighted} homePath={homePath} onAutocomplete={handleAutocomplete} path={row.path} ref={renderProps.ref} />
            )
          }
        />
      </Dialog>

      <Dialog
        containerClassName="h-auto w-[min(calc(100vw-1rem),28rem)]"
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setFolderCreationDialogOpen(false);
        }}
        onOpenChangeComplete={(nextOpen) => {
          if (!nextOpen) createFolderMutation.reset();
        }}
        open={folderCreationDialogOpen}
        title="Create folder?"
      >
        <div className="flex flex-col gap-5 pb-5 pt-3">
          <p className="text-sm leading-6 text-neutral-400">
            The folder <span className="text-neutral-200">{folderCreationPath}</span> does not exist. Create it and open it as a project?
          </p>

          {createFolderMutation.error && <p className="text-sm text-red-400">Unable to create this folder.</p>}

          <div className="flex justify-end gap-2">
            <Button
              className="rounded-xl px-3 py-2 text-sm text-neutral-400 hover:bg-white/7 hover:text-neutral-100"
              onClick={() => setFolderCreationDialogOpen(false)}
              variant="bare"
            >
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
