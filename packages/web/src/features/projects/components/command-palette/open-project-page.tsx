import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import CommandPaletteItem from "@/features/command-palette/components/command-palette-item";
import CommandPaletteList from "@/features/command-palette/components/command-palette-list";
import CreateFolderDialog from "@/features/projects/components/command-palette/create-folder-dialog";
import {useFolderBrowser} from "@/features/projects/hooks/command-palette/use-folder-browser";
import {formatSuggestionPath} from "@/features/projects/lib/command-palette/folder-browsing";
import type {FolderBrowserFolderRow} from "@/features/projects/lib/command-palette/folder-browsing";
import {useProjectsStore} from "@/features/projects/stores/projects-store";
import {cn} from "@/lib/cn";

interface FolderPathProps {
  readonly homePath: string | undefined;
  readonly row: FolderBrowserFolderRow;
}

/** A folder's path with its parent and trailing slash dimmed, and `~` for the home folder. */
function FolderPath(props: FolderPathProps) {
  const {homePath, row} = props;
  if (row.kind === "parent") return <>..</>;

  const {name, parent, suffix} = formatSuggestionPath(row.path, homePath);
  return (
    <>
      {parent && <span className="text-ink-muted">{parent}</span>}
      {name}
      <span className="text-ink-muted">{suffix}</span>
    </>
  );
}

interface OpenProjectPageProps {
  readonly onBack: () => void;
  /** Called once a folder is chosen, before `onOpenProject`. */
  readonly onClose: () => void;
  readonly onOpenProject: (projectPath: string) => void;
}

/** The command palette page that browses the server's folders and opens one as a project. */
export default function OpenProjectPage(props: OpenProjectPageProps) {
  const {onBack, onClose, onOpenProject} = props;
  const [folderToCreate, setFolderToCreate] = useState<string>();
  const projects = useProjectsStore((state) => state.projects);
  const browser = useFolderBrowser({recentProjectPaths: projects.map((project) => project.path)});
  const canOpen = browser.resolved !== undefined && browser.resolved.type !== "file" && folderToCreate === undefined;

  const openProject = (path: string): void => {
    onClose();
    onOpenProject(path);
  };

  const handleOpen = (): void => {
    if (!browser.resolved || !canOpen) return;
    if (browser.resolved.type === "directory") openProject(browser.resolved.path);
    else setFolderToCreate(browser.resolved.path);
  };

  const handleEnter = (row: FolderBrowserFolderRow): void => {
    void browser.enter(row.path);
  };

  // Only a loaded listing can say nothing matched. Before the first one arrives the list says it is loading, after a
  // pause so a fast server shows the folders without a loading line in between.
  const status = browser.error ? (
    <p className="px-3 py-2 text-sm text-danger-ink">Unable to search folders.</p>
  ) : browser.loading ? (
    <p className="animate-[fade-in-delayed_150ms_ease-out_300ms_both] px-3 py-2 text-sm text-ink-faint">Loading folders…</p>
  ) : (
    browser.folderLoaded && !browser.rows.some((row) => row.type === "folder" && row.kind === "folder") && <p className="px-3 py-2 text-sm text-ink-faint">No matching folders.</p>
  );

  return (
    <>
      <CommandPaletteList
        getRowKey={(row: FolderBrowserFolderRow) => `${row.kind}-${row.path}`}
        hints={[
          {hotkeys: ["Tab"], label: "Complete"},
          {hotkeys: ["Enter"], label: "Open"},
        ]}
        inputTrailing={
          <Button
            className={cn("size-6", browser.resolved?.type === "file" && "pointer-events-none invisible")}
            disabled={!canOpen}
            onClick={handleOpen}
            shape="icon"
            size="sm"
            title="Open project path"
            variant="ghost"
          >
            <Icon className="text-ink-muted" name="arrow-right" size="sm" />
          </Button>
        }
        onBack={onBack}
        onHighlight={(row) => browser.preload(row.path)}
        onQueryChange={browser.type}
        onSelect={handleEnter}
        onSubmit={handleOpen}
        onTab={handleEnter}
        placeholder="Search folders"
        query={browser.path}
        renderRow={(row, itemState) => (
          <CommandPaletteItem {...itemState} icon={row.kind === "parent" ? "corner-left-up" : "folder"}>
            <FolderPath homePath={browser.homePath} row={row} />
          </CommandPaletteItem>
        )}
        rows={browser.rows}
        status={status}
      />
      <CreateFolderDialog onCancel={() => setFolderToCreate(undefined)} onCreated={openProject} path={folderToCreate} />
    </>
  );
}
