import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";
import Menu, {MenuItem} from "@/components/ui/menu";
import DiffStat from "@/features/workspace/components/changes/diff/diff-stat";
import GitStatusBadge from "@/features/workspace/components/changes/diff/git-status-badge";
import FileTree from "@/features/workspace/components/file-tree/file-tree";
import FileTreeSkeleton from "@/features/workspace/components/file-tree/file-tree-skeleton";
import FileDiffView from "@/features/workspace/components/file-viewer/file-diff-view";
import FileViewer from "@/features/workspace/components/file-viewer/file-viewer";
import {projectNameFromPath} from "@/features/projects/lib/project-paths";
import {useWorkspaceChanges} from "@/features/workspace/hooks/api/use-workspace-changes";
import {useWorkspaceDiffContents} from "@/features/workspace/hooks/api/use-workspace-diff-contents";
import {useWorkspaceRepositories} from "@/features/workspace/hooks/api/use-workspace-repositories";
import {buildFlatList, buildTree} from "@/features/workspace/lib/file-tree";
import {workspaceErrorMessage} from "@/features/workspace/lib/workspace-error-message";
import {useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import type {WorkspaceChangeEntry} from "@supernova/contracts/workspace/schemas";
import type {WorkspaceChangesTab} from "@/features/workspace/types/workspace-panel";
import {cn} from "@/lib/cn";

type ChangesView = "flat" | "tree";

interface ChangeDiffProps {
  readonly entry: WorkspaceChangeEntry | undefined;
  readonly expanded: boolean;
  readonly path: string;
  readonly projectPath: string;
  readonly repositoryRoot: string;
  readonly split: boolean;
}

function ChangeDiff(props: ChangeDiffProps) {
  const {entry, expanded, path, projectPath, repositoryRoot, split} = props;
  const diff = useWorkspaceDiffContents(projectPath, repositoryRoot, path);

  if (!entry) return <p className="px-4 py-3 text-sm text-ink-faint">This file is no longer part of the uncommitted changes.</p>;
  if (diff.error) return <p className="px-4 py-3 text-sm text-ink-faint">{workspaceErrorMessage(diff.error)}</p>;
  if (!diff.data) return <div aria-label="Loading" className="mx-4 my-3 h-4 w-32 animate-pulse rounded-full bg-overlay-pressed" />;
  return <FileDiffView expanded={expanded} newContents={diff.data.newContents} oldContents={diff.data.oldContents} path={path} split={split} />;
}

interface RepositoryPickerProps {
  readonly onSelect: (repositoryRoot: string) => void;
  readonly projectPath: string;
  readonly repositories: readonly string[];
  readonly repositoryRoot: string;
}

function repositoryLabel(projectPath: string, root: string): string {
  return root === "." ? projectNameFromPath(projectPath) : root;
}

/** Plain text for the usual single repository; a menu when the project folder holds several. */
function RepositoryPicker(props: RepositoryPickerProps) {
  const {onSelect, projectPath, repositories, repositoryRoot} = props;
  const label = repositoryLabel(projectPath, repositoryRoot);
  if (repositories.length < 2) return <span className="truncate">{label}</span>;

  return (
    <Menu
      align="start"
      sideOffset={4}
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="-ml-1.5 flex min-w-0 items-center gap-1 px-1.5 py-0.5 text-sm text-ink-muted" variant="primary">
          <span className="truncate">{label}</span>
          <Icon className="shrink-0" name="chevron-down" size="xs" />
        </Button>
      )}
      triggerLabel="Select repository"
    >
      {repositories.map((root) => (
        <MenuItem key={root} onClick={() => onSelect(root)} trailing={root === repositoryRoot && <Icon name="check" size="xs" />}>
          {repositoryLabel(projectPath, root)}
        </MenuItem>
      ))}
    </Menu>
  );
}

interface RepositoryChangesProps {
  readonly projectPath: string;
  readonly repositories: readonly string[];
  readonly repositoryRoot: string;
  readonly sessionId: string;
  readonly tab: WorkspaceChangesTab;
}

function RepositoryChanges(props: RepositoryChangesProps) {
  const {projectPath, repositories, repositoryRoot, sessionId, tab} = props;
  const {selection} = tab;
  const changes = useWorkspaceChanges(projectPath, repositoryRoot);
  const updateTab = useWorkspacePanelStore((state) => state.updateTab);
  const selectChange = (path: string): void => updateTab<WorkspaceChangesTab>(sessionId, tab.id, (current) => ({...current, selection: path}));
  const selectRepository = (root: string): void => updateTab<WorkspaceChangesTab>(sessionId, tab.id, (current) => ({...current, repositoryRoot: root, selection: null}));
  const [changesView, setChangesView] = useState<ChangesView>("tree");
  const [diffExpanded, setDiffExpanded] = useState(false);
  const [diffSplit, setDiffSplit] = useState(false);

  const uncommitted = changes.data?.uncommitted ?? [];
  const additions = uncommitted.reduce((total, entry) => total + entry.additions, 0);
  const deletions = uncommitted.reduce((total, entry) => total + entry.deletions, 0);
  const selectedEntry = selection === null ? undefined : uncommitted.find((entry) => entry.path === selection);
  const entries = new Map(uncommitted.map((entry) => [entry.path, entry]));
  const paths = uncommitted.map((entry) => entry.path);

  if (changes.error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="px-6 text-center text-sm text-ink-faint">{workspaceErrorMessage(changes.error)}</p>
      </div>
    );
  }

  const list = (
    <>
      <div className="flex h-8 shrink-0 items-center justify-between gap-2 px-3">
        <span className="flex min-w-0 items-baseline gap-1.5 text-sm text-ink-muted">
          <RepositoryPicker onSelect={selectRepository} projectPath={projectPath} repositories={repositories} repositoryRoot={repositoryRoot} />
          <DiffStat additions={additions} deletions={deletions} />
        </span>
        <Menu
          trigger={(triggerProps) => (
            <IconButton {...triggerProps} className="size-7 text-ink-muted" label="Change list view" variant="primary">
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
      </div>
      {changes.isPending ? (
        <FileTreeSkeleton />
      ) : (
        <FileTree
          key={`${repositoryRoot}:${changesView}`}
          emptyLabel="No uncommitted changes."
          expandedByDefault
          label="Uncommitted changes"
          nodes={changesView === "tree" ? buildTree(paths, entries) : buildFlatList(paths, entries)}
          onSelectFile={(node) => selectChange(node.path)}
          selectedPath={selection ?? undefined}
        />
      )}
    </>
  );

  return (
    <FileViewer
      actions={
        <>
          {selectedEntry && <DiffStat additions={selectedEntry.additions} deletions={selectedEntry.deletions} />}
          {selectedEntry && <GitStatusBadge status={selectedEntry.status} />}
          <IconButton
            className={cn("size-7 text-ink-muted", diffSplit && "bg-overlay-hover text-ink")}
            label={diffSplit ? "Show unified diff" : "Show split diff"}
            onClick={() => setDiffSplit((value) => !value)}
            variant="primary"
          >
            <Icon name="columns" size="sm" />
          </IconButton>
          <IconButton
            className={cn("size-7 text-ink-muted", diffExpanded && "bg-overlay-hover text-ink")}
            label={diffExpanded ? "Collapse unchanged lines" : "Show whole file"}
            onClick={() => setDiffExpanded((value) => !value)}
            variant="primary"
          >
            <Icon name={diffExpanded ? "fold-vertical" : "unfold-vertical"} size="sm" />
          </IconButton>
        </>
      }
      deleted={selectedEntry?.status === "deleted"}
      explorer={list}
      path={selection}
    >
      {selection !== null && (
        <ChangeDiff entry={selectedEntry} expanded={diffExpanded} key={selection} path={selection} projectPath={projectPath} repositoryRoot={repositoryRoot} split={diffSplit} />
      )}
    </FileViewer>
  );
}

interface ChangesTabProps {
  readonly projectPath: string;
  readonly sessionId: string;
  readonly tab: WorkspaceChangesTab;
}

export default function ChangesTab(props: ChangesTabProps) {
  const {projectPath, sessionId, tab} = props;
  const repositories = useWorkspaceRepositories(projectPath);

  if (repositories.isPending) return <FileTreeSkeleton />;
  // A picked repository that vanished (folder removed) falls back to the first one rather than erroring.
  const roots = repositories.data?.repositories ?? [];
  const repositoryRoot = tab.repositoryRoot !== null && roots.includes(tab.repositoryRoot) ? tab.repositoryRoot : roots[0];
  if (repositories.error || repositoryRoot === undefined) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="px-6 text-center text-sm text-ink-faint">{repositories.error ? workspaceErrorMessage(repositories.error) : "This project is not a Git repository."}</p>
      </div>
    );
  }

  return <RepositoryChanges projectPath={projectPath} repositories={roots} repositoryRoot={repositoryRoot} sessionId={sessionId} tab={tab} />;
}
