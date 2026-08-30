import {useState} from "react";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import {useGeneralSettingsStore} from "@/features/settings/stores/general-settings-store";

interface CheckpointConflictDialogProps {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly open: boolean;
}

/** Confirms discarding manual workspace changes before retrying checkpoint navigation with force. */
export default function CheckpointConflictDialog(props: CheckpointConflictDialogProps) {
  const {onCancel, onConfirm, open} = props;
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const setConfirmCheckpointConflicts = useGeneralSettingsStore((state) => state.setConfirmCheckpointConflicts);

  const handleCancel = (): void => {
    setDontAskAgain(false);
    onCancel();
  };

  const handleConfirm = (): void => {
    if (dontAskAgain) setConfirmCheckpointConflicts(false);
    setDontAskAgain(false);
    onConfirm();
  };

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) handleCancel();
  };

  return (
    <Dialog className="h-auto" containerClassName="h-auto w-[min(calc(100vw-1rem),26rem)]" onOpenChange={handleOpenChange} open={open} title="Discard changes?">
      <div className="flex flex-col gap-5 pb-5 pt-2">
        <p className="text-sm text-ink-muted">
          Changes have been made to files since the current checkpoint. Continuing will overwrite those changes, and they cannot be recovered.
        </p>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
          <input checked={dontAskAgain} className="size-3.5 cursor-pointer accent-ink" onChange={(event) => setDontAskAgain(event.target.checked)} type="checkbox" />
          Don&apos;t ask again
        </label>
        <div className="flex justify-end gap-2">
          <Button className="w-auto px-3 py-1.5 text-sm" onClick={handleCancel} variant="primary">
            Cancel
          </Button>
          <Button className="w-auto px-3 py-1.5 text-sm text-danger-ink" onClick={handleConfirm} variant="primary">
            Discard and continue
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
