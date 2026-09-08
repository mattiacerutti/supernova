import {useState} from "react";
import IconButton from "@/components/ui/icon-button";
import {showToast} from "@/components/ui/toast-manager";
import {cn} from "@/lib/cn";
import UpdateInstallDialog from "@/features/updates/components/update-install-dialog";
import UpdateStatusIcon from "@/features/updates/components/update-status-icon";
import {useDesktopUpdate} from "@/features/updates/hooks/use-desktop-update";

interface UpdateButtonProps {
  className?: string;
}

export default function UpdateButton(props: UpdateButtonProps) {
  const {className} = props;
  const {state, download, install} = useDesktopUpdate();
  const [pending, setPending] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  if (!state) return null;

  const downloading = state.status === "downloading";
  const actionable = state.status === "available" || state.status === "downloaded" || (state.status === "error" && state.version !== null);
  if (!actionable && !downloading) return null;

  const version = state.version ?? "";
  const label = downloading
    ? `Downloading update ${state.downloadPercent ?? 0}%`
    : state.status === "downloaded"
      ? `Restart to install ${version}`.trim()
      : state.status === "error"
        ? "Retry the update download"
        : `Download update ${version}`.trim();

  const runUpdateAction = (action: () => Promise<void>, failureTitle: string): void => {
    setPending(true);
    void action()
      .catch(() => showToast(failureTitle, "Restart Supernova and try again."))
      .finally(() => setPending(false));
  };

  const handleClick = (): void => {
    if (state.status === "downloaded") {
      setInstallDialogOpen(true);
      return;
    }

    runUpdateAction(download, "Could not download the update");
  };

  const handleConfirmInstall = (): void => {
    setInstallDialogOpen(false);
    runUpdateAction(install, "Could not install the update");
  };

  const handleCancelInstall = (): void => {
    setInstallDialogOpen(false);
  };

  return (
    <>
      <IconButton className={cn("group size-7", className)} disabled={downloading || pending} label={label} onClick={handleClick} title={label}>
        <UpdateStatusIcon downloadPercent={state.downloadPercent} status={state.status} />
      </IconButton>
      <UpdateInstallDialog onCancel={handleCancelInstall} onConfirm={handleConfirmInstall} open={installDialogOpen} version={state.version} />
    </>
  );
}
