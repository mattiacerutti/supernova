import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";

interface CheckpointConflictDialogProps {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly open: boolean;
}

/** Confirms discarding manual workspace changes before retrying checkpoint navigation with force. */
export default function CheckpointConflictDialog(props: CheckpointConflictDialogProps) {
  const {onCancel, onConfirm, open} = props;

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) onCancel();
  };

  return (
    <Dialog className="h-auto" containerClassName="h-auto w-[min(calc(100vw-1rem),26rem)]" onOpenChange={handleOpenChange} open={open} title="Discard changes?">
      <div className="flex flex-col gap-5 pb-5 pt-2">
        <p className="text-sm text-ink-muted">
          Changes have been made to files since the current checkpoint. Continuing will overwrite those changes, and they cannot be recovered.
        </p>
        <div className="flex justify-end gap-2">
          <Button className="w-auto px-3 py-1.5 text-sm" onClick={onCancel} variant="primary">
            Cancel
          </Button>
          <Button className="w-auto px-3 py-1.5 text-sm text-danger-ink" onClick={onConfirm} variant="primary">
            Discard and continue
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
