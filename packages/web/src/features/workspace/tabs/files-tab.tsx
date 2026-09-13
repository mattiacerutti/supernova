import {useState} from "react";
import SearchField from "@/components/ui/search-field";
import FileTree from "@/features/workspace/components/file-tree/file-tree";
import FileContentView from "@/features/workspace/components/file-viewer/file-content-view";
import FileViewer from "@/features/workspace/components/file-viewer/file-viewer";
import {mockFileContent} from "@/features/workspace/lib/mock-workspace";
import {buildFileTree, filterFileTree} from "@/features/workspace/lib/file-tree";
import {useWorkspacePanelStore, WORKSPACE_TAB_KINDS} from "@/features/workspace/stores/workspace-panel-store";
import type {WorkspaceFileNode} from "@/features/workspace/types/workspace";
import type {WorkspaceFilesTab, WorkspacePanelTab} from "@/features/workspace/types/workspace-panel";

function insertTabAfterActive(tabs: readonly WorkspacePanelTab[], activeTabId: string | null, tab: WorkspacePanelTab): readonly WorkspacePanelTab[] {
  const activeIndex = tabs.findIndex((candidate) => candidate.id === activeTabId);
  const insertAt = activeIndex === -1 ? tabs.length : activeIndex + 1;
  return [...tabs.slice(0, insertAt), tab, ...tabs.slice(insertAt)];
}

/** An unpinned files tab shows the file in place; a pinned one keeps its file and a new tab opens after it. */
function openFileInTabs(tabs: readonly WorkspacePanelTab[], activeTabId: string | null, path: string): {readonly activeTabId: string; readonly tabs: readonly WorkspacePanelTab[]} {
  const active = tabs.find((tab) => tab.id === activeTabId);
  if (active?.kind === "files" && !active.pinned) {
    return {activeTabId: active.id, tabs: tabs.map((tab) => (tab.id === active.id ? {...active, file: path} : tab))};
  }
  const created: WorkspaceFilesTab = {...WORKSPACE_TAB_KINDS.files.create(), file: path};
  return {activeTabId: created.id, tabs: insertTabAfterActive(tabs, activeTabId, created)};
}

interface FilesTabProps {
  readonly files: readonly WorkspaceFileNode[];
  readonly tab: WorkspaceFilesTab;
}

export default function FilesTab(props: FilesTabProps) {
  const {files, tab} = props;
  const setTabs = useWorkspacePanelStore((state) => state.setTabs);
  const openFile = (path: string): void => {
    const {activeTabId, tabs} = useWorkspacePanelStore.getState();
    const next = openFileInTabs(tabs, activeTabId, path);
    setTabs(next.tabs, next.activeTabId);
  };
  const [query, setQuery] = useState("");

  const tree = buildFileTree(files);
  const searching = query.trim().length > 0;

  return (
    <FileViewer
      explorer={
        <>
          <SearchField className="border-b-0 py-1.5" onChange={(event) => setQuery(event.target.value)} placeholder="Search files" value={query} />
          <FileTree
            emptyLabel={searching ? "No files match." : "This project has no files."}
            key={searching ? "search" : "tree"}
            label="Project files"
            nodes={searching ? filterFileTree(tree, query) : tree}
            onSelectFile={(node) => node.path !== tab.file && openFile(node.path)}
            selectedPath={tab.file ?? undefined}
          />
        </>
      }
      path={tab.file}
    >
      {tab.file !== null && <FileContentView content={mockFileContent(tab.file)} key={tab.file} path={tab.file} />}
    </FileViewer>
  );
}
