import Button from "@/components/ui/button";
import Dialog from "@/components/ui/dialog";
import {useCreateFolder} from "@/features/projects/api/command-palette/create-folder";

interface CreateFolderDialogProps {
  readonly onCancel: () => void;
  /** Called with the created folder's path. */
  readonly onCreated: (path: string) => void;
  /** The folder to create; the dialog is open while this is set. */
  readonly path: string | undefined;
}

/** Asks before creating a folder that does not exist yet, then creates it. */
export default function CreateFolderDialog(props: CreateFolderDialogProps) {
  const {onCancel, onCreated, path} = props;
  const createFolder = useCreateFolder();

  const handleOpenChange = (open: boolean): void => {
    if (!open) onCancel();
  };

  const handleOpenChangeComplete = (open: boolean): void => {
    if (!open) createFolder.reset();
  };

  const handleCreate = (): void => {
    if (!path) return;
    createFolder.mutate({path}, {onSuccess: (result) => onCreated(result.path)});
  };

  return (
    <Dialog
      containerClassName="h-auto w-[min(calc(100vw-1rem),28rem)]"
      onOpenChange={handleOpenChange}
      onOpenChangeComplete={handleOpenChangeComplete}
      open={path !== undefined}
      title="Create folder?"
    >
      <div className="flex flex-col gap-5 pb-5 pt-3">
        <p className="text-sm leading-6 text-ink-muted">
          The folder <span className="text-ink">{path}</span> does not exist. Create it and open it as a project?
        </p>

        {createFolder.error && <p className="text-sm text-danger-ink">Unable to create this folder.</p>}

        <div className="flex justify-end gap-2">
          <Button className="rounded-xl px-3 py-2 text-sm text-ink-muted hover:bg-overlay-hover hover:text-ink-strong" onClick={onCancel} variant="bare">
            Cancel
          </Button>
          <Button
            className="rounded-xl bg-overlay-pressed px-3 py-2 text-sm text-ink-strong hover:bg-overlay-strong disabled:hover:bg-overlay-pressed"
            disabled={createFolder.isPending}
            onClick={handleCreate}
            variant="bare"
          >
            Create folder
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
