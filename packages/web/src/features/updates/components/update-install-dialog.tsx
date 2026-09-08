import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";

interface UpdateInstallDialogProps {
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
  readonly open: boolean;
  readonly version: string | null;
}

export default function UpdateInstallDialog(props: UpdateInstallDialogProps) {
  const {onCancel, onConfirm, open, version} = props;

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) onCancel();
  };

  return (
    <Dialog
      className="h-auto"
      containerClassName="h-auto w-[min(calc(100vw-1rem),26rem)]"
      onOpenChange={handleOpenChange}
      open={open}
      title={version ? `Install ${version} and restart?` : "Install update and restart?"}
    >
      <div className="flex flex-col gap-5 pb-5 pt-2">
        <p className="text-sm text-ink-muted">Supernova will close and reopen on the new version. Running sessions will be interrupted.</p>
        <div className="flex justify-end gap-2">
          <Button className="w-auto px-3 py-1.5 text-sm" onClick={onCancel} variant="primary">
            Cancel
          </Button>
          <Button className="w-auto px-3 py-1.5 text-sm" onClick={onConfirm} variant="filled">
            Install and restart
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
