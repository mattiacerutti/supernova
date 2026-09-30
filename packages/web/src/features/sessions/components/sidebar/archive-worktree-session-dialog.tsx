import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";

interface ArchiveWorktreeSessionDialogProps {
  readonly onArchive: (removeWorktree: boolean) => void;
  readonly onCancel: () => void;
  readonly open: boolean;
}

/** Asks whether archiving a worktree session should also delete its worktree and branch. */
export default function ArchiveWorktreeSessionDialog(props: ArchiveWorktreeSessionDialogProps) {
  const {onArchive, onCancel, open} = props;

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) onCancel();
  };

  return (
    <Dialog className="h-auto" containerClassName="h-auto w-[min(calc(100vw-1rem),26rem)]" onOpenChange={handleOpenChange} open={open} title="Archive worktree chat?">
      <div className="flex flex-col gap-5 pb-5 pt-2">
        <p className="text-sm text-ink-muted">
          This chat runs in its own worktree. Removing the worktree deletes its branch and any uncommitted changes in it; keeping it leaves the branch and files on disk.
        </p>
        <div className="flex justify-end gap-2">
          <Button className="w-auto px-3 py-1.5 text-sm" onClick={onCancel} variant="primary">
            Cancel
          </Button>
          <Button className="w-auto px-3 py-1.5 text-sm" onClick={() => onArchive(false)} variant="primary">
            Keep worktree
          </Button>
          <Button className="w-auto px-3 py-1.5 text-sm text-danger-ink" onClick={() => onArchive(true)} variant="primary">
            Remove worktree
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
