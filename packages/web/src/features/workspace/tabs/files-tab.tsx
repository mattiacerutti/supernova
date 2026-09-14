import {useState} from "react";
import SearchField from "@/components/ui/search-field";
import FileTree from "@/features/workspace/components/file-tree/file-tree";
import FileTreeSkeleton from "@/features/workspace/components/file-tree/file-tree-skeleton";
import FileContentView from "@/features/workspace/components/file-viewer/file-content-view";
import FileViewer from "@/features/workspace/components/file-viewer/file-viewer";
import {useWorkspaceFile} from "@/features/workspace/hooks/api/use-workspace-file";
import {useWorkspaceFiles} from "@/features/workspace/hooks/api/use-workspace-files";
import {buildFlatList, buildTree} from "@/features/workspace/lib/file-tree";
import {workspaceErrorMessage} from "@/features/workspace/lib/workspace-error-message";
import {EMPTY_LAYOUT, useWorkspacePanelStore, WORKSPACE_TAB_KINDS} from "@/features/workspace/stores/workspace-panel-store";
import type {WorkspacePanelLayout} from "@/features/workspace/stores/workspace-panel-store";
import type {WorkspaceFilesTab, WorkspacePanelTab} from "@/features/workspace/types/workspace-panel";

function insertTabAfterActive(tabs: readonly WorkspacePanelTab[], activeTabId: string | null, tab: WorkspacePanelTab): readonly WorkspacePanelTab[] {
  const activeIndex = tabs.findIndex((candidate) => candidate.id === activeTabId);
  const insertAt = activeIndex === -1 ? tabs.length : activeIndex + 1;
  return [...tabs.slice(0, insertAt), tab, ...tabs.slice(insertAt)];
}

/** An unpinned files tab shows the file in place; a pinned one keeps its file and a new tab opens after it. */
function openFileInTabs(layout: WorkspacePanelLayout, path: string): WorkspacePanelLayout {
  const {activeTabId, tabs} = layout;
  const active = tabs.find((tab) => tab.id === activeTabId);
  if (active?.kind === "files" && !active.pinned) {
    return {...layout, activeTabId: active.id, tabs: tabs.map((tab) => (tab.id === active.id ? {...active, file: path} : tab))};
  }
  const created: WorkspaceFilesTab = {...WORKSPACE_TAB_KINDS.files.create(), file: path};
  return {...layout, activeTabId: created.id, tabs: insertTabAfterActive(tabs, activeTabId, created)};
}

interface FileContentProps {
  readonly path: string;
  readonly projectPath: string;
}

function FileContent(props: FileContentProps) {
  const {path, projectPath} = props;
  const file = useWorkspaceFile(projectPath, path);

  if (file.error) return <p className="px-4 py-3 text-sm text-ink-faint">{workspaceErrorMessage(file.error)}</p>;
  if (!file.data) return <div aria-label="Loading" className="mx-4 my-3 h-4 w-32 animate-pulse rounded-full bg-overlay-pressed" />;
  return <FileContentView content={file.data.content} path={path} />;
}

interface FilesTabProps {
  readonly projectPath: string;
  readonly sessionId: string;
  readonly tab: WorkspaceFilesTab;
}

export default function FilesTab(props: FilesTabProps) {
  const {projectPath, sessionId, tab} = props;
  const files = useWorkspaceFiles(projectPath);
  const setLayout = useWorkspacePanelStore((state) => state.setLayout);
  const [query, setQuery] = useState("");

  const openFile = (path: string): void => {
    setLayout(sessionId, openFileInTabs(useWorkspacePanelStore.getState().layouts[sessionId] ?? EMPTY_LAYOUT, path));
  };

  if (files.error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="px-6 text-center text-sm text-ink-faint">{workspaceErrorMessage(files.error)}</p>
      </div>
    );
  }

  const paths = files.data?.files ?? [];
  const needle = query.trim().toLowerCase();
  const searching = needle.length > 0;

  return (
    <FileViewer
      explorer={
        <>
          <SearchField className="border-b-0 py-1.5" onChange={(event) => setQuery(event.target.value)} placeholder="Search files" value={query} />
          {files.isPending ? (
            <FileTreeSkeleton />
          ) : (
            <FileTree
              emptyLabel={searching ? "No files match." : "This project has no files."}
              key={searching ? "search" : "tree"}
              label="Project files"
              nodes={searching ? buildFlatList(paths.filter((path) => path.toLowerCase().includes(needle))) : buildTree(paths)}
              onSelectFile={(node) => node.path !== tab.file && openFile(node.path)}
              selectedPath={tab.file ?? undefined}
            />
          )}
        </>
      }
      path={tab.file}
    >
      {tab.file !== null && <FileContent key={tab.file} path={tab.file} projectPath={projectPath} />}
    </FileViewer>
  );
}
