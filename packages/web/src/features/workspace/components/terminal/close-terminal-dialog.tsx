import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";

interface CloseTerminalDialogProps {
  readonly label: string;
  readonly onCancel: () => void;
  readonly onDetach: () => void;
  readonly onKill: () => void;
  readonly open: boolean;
}

export default function CloseTerminalDialog(props: CloseTerminalDialogProps) {
  const {label, onCancel, onDetach, onKill, open} = props;

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) onCancel();
  };

  return (
    <Dialog className="h-auto" containerClassName="h-auto w-[min(calc(100vw-1rem),26rem)]" onOpenChange={handleOpenChange} open={open} title={`Close ${label}?`}>
      <div className="flex flex-col gap-5 pb-5 pt-2">
        <p className="text-sm text-ink-muted">Anything running in this terminal can keep going after you close the tab. You can reopen it later from the + button.</p>
        <div className="flex justify-end gap-2">
          <Button className="w-auto px-3 py-1.5 text-sm" onClick={onCancel} variant="primary">
            Cancel
          </Button>
          <Button autoFocus className="w-auto px-3 py-1.5 text-sm" onClick={onDetach} variant="primary">
            Keep running
          </Button>
          <Button className="w-auto px-3 py-1.5 text-sm text-danger-ink hover:text-danger-ink" onClick={onKill} variant="primary">
            Kill terminal
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
