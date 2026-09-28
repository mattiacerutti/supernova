import {useNavigate} from "@tanstack/react-router";
import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import Icon from "@/components/ui/icon";
import {useForkSession} from "@/features/sessions/api/conversation/fork-session";

interface ForkSessionDialogProps {
  readonly onClose: () => void;
  readonly sessionId: string;
  /** Turn to fork through; the dialog is open while set. */
  readonly turnId: string | null;
}

/** Confirms forking a session through a turn, shows progress in place, and opens the fork. */
export default function ForkSessionDialog(props: ForkSessionDialogProps) {
  const {onClose, sessionId, turnId} = props;
  const navigate = useNavigate();
  const forkSession = useForkSession();

  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && !forkSession.isPending) onClose();
  };

  const handleOpenChangeComplete = (open: boolean): void => {
    if (!open) forkSession.reset();
  };

  const handleConfirm = (): void => {
    if (!turnId) return;
    forkSession.mutate(
      {sessionId, turnId},
      {
        onSuccess: (session) => {
          onClose();
          void navigate({params: {sessionId: session.id}, to: "/session/$sessionId"});
        },
      }
    );
  };

  return (
    <Dialog
      className="h-auto"
      containerClassName="h-auto w-[min(calc(100vw-1rem),26rem)]"
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
      open={turnId !== null}
      title="Fork session?"
    >
      <div className="flex flex-col gap-5 pb-5 pt-2">
        <p className="text-sm text-ink-muted">
          Starts a new session with the conversation up to this message. Files are not changed, and messages before the fork cannot be undone from the new session.
        </p>
        {forkSession.error && (
          <p className="text-sm text-danger-ink" role="alert">
            {forkSession.error instanceof Error ? forkSession.error.message : "Unable to fork this session."}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button className="w-auto px-3 py-1.5 text-sm" disabled={forkSession.isPending} onClick={onClose} variant="primary">
            Cancel
          </Button>
          <Button
            aria-busy={forkSession.isPending}
            className="flex w-auto items-center gap-2 px-3 py-1.5 text-sm"
            disabled={forkSession.isPending}
            onClick={handleConfirm}
            variant="filled"
          >
            {forkSession.isPending && <Icon className="animate-spin" name="loader" size="xs" />}
            Fork
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
