import {useState} from "react";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuItem} from "@/components/ui/menu";
import CommitsList from "@/features/workspace/components/changes/commits-list";
import PanelSectionHeader from "@/features/workspace/components/panel-section-header";
import DiffStat from "@/features/workspace/components/changes/diff/diff-stat";
import GitStatusBadge from "@/features/workspace/components/changes/diff/git-status-badge";
import FileTree from "@/features/workspace/components/file-tree/file-tree";
import FileDiffView from "@/features/workspace/components/file-viewer/file-diff-view";
import FileViewer from "@/features/workspace/components/file-viewer/file-viewer";
import {mockPatch} from "@/features/workspace/lib/mock-workspace";
import {useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import {buildChangeTree, buildFlatChangeList} from "@/features/workspace/lib/file-tree";
import type {WorkspaceChangeEntry, WorkspaceChangeSelection, WorkspaceSnapshot} from "@/features/workspace/types/workspace";
import type {WorkspaceChangesTab} from "@/features/workspace/types/workspace-panel";
import {cn} from "@/lib/cn";

// Rows: uncommitted header, body, filler, commits header, body. Spelled out for the Tailwind scanner.
const SECTION_ROWS = {
  both: "grid-rows-[auto_1fr_0fr_auto_1fr]",
  commits: "grid-rows-[auto_0fr_0fr_auto_1fr]",
  none: "grid-rows-[auto_0fr_1fr_auto_0fr]",
  uncommitted: "grid-rows-[auto_1fr_0fr_auto_0fr]",
};

type ChangesView = "flat" | "tree";

interface ChangesTabProps {
  readonly getCommitChanges: (commitId: string) => readonly WorkspaceChangeEntry[];
  readonly snapshot: WorkspaceSnapshot;
  readonly tab: WorkspaceChangesTab;
}

export default function ChangesTab(props: ChangesTabProps) {
  const {getCommitChanges, snapshot, tab} = props;
  const {selection} = tab;
  const updateTab = useWorkspacePanelStore((state) => state.updateTab);
  const selectChange = (selection: WorkspaceChangeSelection): void => updateTab<WorkspaceChangesTab>(tab.id, (current) => ({...current, selection}));
  const [changesView, setChangesView] = useState<ChangesView>("tree");
  const [uncommittedOpen, setUncommittedOpen] = useState(true);
  const [commitsOpen, setCommitsOpen] = useState(false);

  const rowsClassName = uncommittedOpen ? (commitsOpen ? SECTION_ROWS.both : SECTION_ROWS.uncommitted) : commitsOpen ? SECTION_ROWS.commits : SECTION_ROWS.none;
  const additions = snapshot.uncommitted.reduce((total, entry) => total + entry.additions, 0);
  const deletions = snapshot.uncommitted.reduce((total, entry) => total + entry.deletions, 0);
  const selectedEntry = selection && (selection.scope === "commit" ? getCommitChanges(selection.commitId) : snapshot.uncommitted).find((entry) => entry.path === selection.path);

  const list = (
    <>
      <div className={cn("grid min-h-0 flex-1 transition-[grid-template-rows] duration-200 ease-out", rowsClassName)}>
        <PanelSectionHeader
          actions={
            <Menu
              trigger={(triggerProps) => (
                <IconButton {...triggerProps} className="size-7" label="Change list view">
                  <Icon name="more-horizontal" size="sm" />
                </IconButton>
              )}
              triggerLabel="Change list view"
              sideOffset={4}
            >
              <MenuItem onClick={() => setChangesView("tree")} trailing={changesView === "tree" && <Icon name="check" size="xs" />}>
                Folder tree
              </MenuItem>
              <MenuItem onClick={() => setChangesView("flat")} trailing={changesView === "flat" && <Icon name="check" size="xs" />}>
                Flat file list
              </MenuItem>
            </Menu>
          }
          collapsed={!uncommittedOpen}
          label="Uncommitted"
          onToggle={() => setUncommittedOpen((open) => !open)}
          trailing={<DiffStat additions={additions} deletions={deletions} />}
        />

        <div className={cn("flex min-h-0 flex-col overflow-hidden transition-opacity duration-200 ease-out", !uncommittedOpen && "opacity-0")} inert={!uncommittedOpen}>
          <FileTree
            key={changesView}
            emptyLabel="No uncommitted changes."
            expandedByDefault
            label="Uncommitted changes"
            nodes={changesView === "tree" ? buildChangeTree(snapshot.uncommitted) : buildFlatChangeList(snapshot.uncommitted)}
            onSelectFile={(node) => selectChange({path: node.path, scope: "uncommitted"})}
            selectedPath={selection?.scope === "uncommitted" ? selection.path : undefined}
          />
        </div>

        {/* Keeps the commits header at the bottom while both sections are closed. */}
        <div aria-hidden="true" />

        <div className="border-t border-border-muted">
          <PanelSectionHeader collapsed={!commitsOpen} label="Commits" onToggle={() => setCommitsOpen((open) => !open)} />
        </div>

        <div className={cn("flex min-h-0 flex-col overflow-hidden transition-opacity duration-200 ease-out", !commitsOpen && "opacity-0")} inert={!commitsOpen}>
          <CommitsList commits={snapshot.commits} getCommitChanges={getCommitChanges} onSelectFile={selectChange} selection={selection} />
        </div>
      </div>
    </>
  );

  return (
    <FileViewer
      actions={
        <>
          {selection?.scope === "commit" && <span className="font-mono text-xs text-ink-faint">{selection.commitId.slice(0, 7)}</span>}
          {selectedEntry && <DiffStat additions={selectedEntry.additions} deletions={selectedEntry.deletions} />}
          {selectedEntry && <GitStatusBadge status={selectedEntry.status} />}
        </>
      }
      deleted={selectedEntry?.status === "deleted"}
      explorer={list}
      path={selection?.path ?? null}
    >
      {selectedEntry ? (
        <FileDiffView key={`${selection?.scope === "commit" ? selection.commitId : ""}:${selectedEntry.path}`} patch={mockPatch(selectedEntry)} path={selectedEntry.path} />
      ) : (
        <p className="px-4 py-3 text-sm text-ink-faint">This file is no longer part of the selected changes.</p>
      )}
    </FileViewer>
  );
}
