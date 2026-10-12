import type {WorkspaceBranch} from "@supernova/contracts/services/workspace/procedures";
import {matchSorter} from "match-sorter";
import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import type {IconName} from "@/components/ui/icon";
import Menu, {MenuItem, MenuLabel} from "@/components/ui/menu";
import SearchField from "@/components/ui/search-field";
import {useWorkspaceBranches} from "@/features/sessions/api/composer/list-workspace-branches";
import {useComposerContext} from "@/features/sessions/hooks/composer/use-composer";
import {cn} from "@/lib/cn";

const MODE_LABELS = {local: "Current checkout", worktree: "New worktree"} as const;
const MODE_ICONS: Record<keyof typeof MODE_LABELS, IconName> = {local: "folder", worktree: "folder-git"};

interface PickerTriggerProps {
  readonly children: string;
  readonly disabled?: boolean;
  readonly icon: IconName;
  readonly interactive?: boolean;
  readonly triggerProps?: Record<string, unknown>;
}

/** The small pill both pickers use; static when it only reports a locked-in choice. */
function PickerTrigger(props: PickerTriggerProps) {
  const {children, disabled, icon, interactive = true, triggerProps} = props;

  return (
    <Button
      {...triggerProps}
      className={cn("flex min-w-0 items-center gap-1.5 px-2 py-1 text-xs", !interactive && "cursor-default hover:bg-transparent hover:text-current")}
      disabled={disabled || !interactive}
      type="button"
      variant="primary"
    >
      <Icon className="shrink-0 text-ink-muted" name={icon} size="xs" />
      <span className="truncate">{children}</span>
      {interactive && <Icon className="shrink-0 text-ink-muted" name="chevron-down" size="xs" />}
    </Button>
  );
}

interface BranchPickerProps {
  readonly branches: readonly WorkspaceBranch[];
  readonly current: string | undefined;
  readonly disabled: boolean;
  readonly onSelect: (branch: string) => void;
  readonly projectPath: string;
  readonly selected: string;
}

/** Picks the base ref of a new worktree. */
function BranchPicker(props: BranchPickerProps) {
  const {branches, current, disabled, onSelect, projectPath, selected} = props;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = search.trim() ? matchSorter(branches, search.trim(), {keys: ["name"]}) : branches;

  const handleOpenChange = (nextOpen: boolean): void => {
    if (nextOpen) setSearch("");
    setOpen(nextOpen);
  };

  const handleSelect = (name: string): void => {
    onSelect(name);
    setOpen(false);
  };

  return (
    <Menu
      align="start"
      className="w-[min(18rem,calc(100vw-2rem))] p-0"
      onOpenChange={handleOpenChange}
      open={open}
      side="top"
      sideOffset={6}
      trigger={(triggerProps) => (
        <PickerTrigger disabled={disabled} icon="git-branch" triggerProps={triggerProps}>
          {`From ${selected}`}
        </PickerTrigger>
      )}
      triggerLabel="Select base branch"
    >
      <SearchField
        onChange={(event) => setSearch(event.target.value)}
        onKeyDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="Search branches"
        value={search}
      />
      <div className="scroll-fade-b max-h-60 overflow-y-auto p-1">
        {filtered.length === 0 && <div className="px-3 py-6 text-center text-sm text-ink-muted">No branches found</div>}
        {filtered.map((branch) => {
          const badge = branch.name === current ? "current" : branch.worktreePath && branch.worktreePath !== projectPath ? "worktree" : branch.remote ? "remote" : undefined;
          return (
            <MenuItem
              key={branch.name}
              onClick={() => handleSelect(branch.name)}
              trailing={
                <span className="flex items-center gap-2 text-xs text-ink-faint">
                  {badge}
                  {branch.name === selected && <Icon className="text-ink" name="check" size="xs" />}
                </span>
              }
            >
              {branch.name}
            </MenuItem>
          );
        })}
      </div>
    </Menu>
  );
}

/** Placeholder pill for the picker while the server has not told us where the session runs yet. */
export function WorkspacePickerSkeleton() {
  return <span aria-hidden="true" className="h-5 w-32 animate-pulse rounded-xl corner-superellipse/1.3 bg-overlay-pressed" />;
}

interface WorkspacePickerProps {
  /** Set for an existing session; the choice is then shown, not changed. */
  readonly worktreeBranch?: string;
}

/**
 * Where a new session runs: the project's checkout, or a fresh worktree off a chosen branch. Hidden for
 * projects that are not Git repositories. For an existing worktree session it shows the branch only.
 */
export default function WorkspacePicker(props: WorkspacePickerProps) {
  const {worktreeBranch} = props;
  const {disabled, draft, projectPath} = useComposerContext();
  const editable = worktreeBranch === undefined;
  const branchesQuery = useWorkspaceBranches(projectPath, {enabled: editable});

  if (worktreeBranch !== undefined) {
    return (
      <PickerTrigger icon="folder-git" interactive={false}>
        {worktreeBranch}
      </PickerTrigger>
    );
  }

  const branches = branchesQuery.data;
  if (!branches) return null;

  const mode = draft.workspace.mode;
  const baseRef = draft.workspace.mode === "worktree" ? draft.workspace.baseRef : (branches.current ?? branches.branches[0]?.name ?? "HEAD");

  const handleModeSelect = (nextMode: keyof typeof MODE_LABELS): void => {
    draft.setWorkspace(nextMode === "worktree" ? {baseRef, mode: "worktree"} : {mode: "local"});
  };

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Menu
        align="start"
        className="w-52"
        side="top"
        sideOffset={6}
        trigger={(triggerProps) => (
          <PickerTrigger disabled={disabled} icon={MODE_ICONS[mode]} triggerProps={triggerProps}>
            {MODE_LABELS[mode]}
          </PickerTrigger>
        )}
        triggerLabel="Select workspace"
      >
        <MenuLabel>Workspace</MenuLabel>
        <div className="space-y-0.5">
          {(Object.keys(MODE_LABELS) as Array<keyof typeof MODE_LABELS>).map((option) => (
            <MenuItem
              icon={<Icon name={MODE_ICONS[option]} size="xs" />}
              key={option}
              onClick={() => handleModeSelect(option)}
              trailing={option === mode && <Icon name="check" size="xs" />}
            >
              {MODE_LABELS[option]}
            </MenuItem>
          ))}
        </div>
      </Menu>
      {mode === "worktree" && (
        <BranchPicker
          branches={branches.branches}
          current={branches.current}
          disabled={disabled}
          onSelect={(branch) => draft.setWorkspace({baseRef: branch, mode: "worktree"})}
          projectPath={projectPath}
          selected={baseRef}
        />
      )}
    </div>
  );
}
