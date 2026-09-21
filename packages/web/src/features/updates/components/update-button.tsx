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
      <IconButton
        className={cn(
          "group relative h-4.5 w-4.5 overflow-hidden transition-[width] duration-160 ease-out enabled:hover:w-14 enabled:focus-visible:w-14 motion-reduce:transition-none",
          className
        )}
        disabled={downloading || pending}
        label={label}
        onClick={handleClick}
        title={label}
      >
        <span className="relative grid h-4.5 w-full place-items-center overflow-hidden rounded-full bg-blue-500 text-white/90">
          <span className="transition-opacity duration-160 group-enabled:group-hover:opacity-0 group-enabled:group-focus-visible:opacity-0 motion-reduce:transition-none">
            <UpdateStatusIcon downloadPercent={state.downloadPercent} status={state.status} />
          </span>
          <span
            aria-hidden="true"
            className="absolute inset-0 grid scale-90 place-items-center whitespace-nowrap text-xs font-semibold opacity-0 transition-opacity duration-160 group-enabled:group-hover:opacity-100 group-enabled:group-focus-visible:opacity-100 motion-reduce:transition-none"
          >
            {state.status === "downloaded" ? "Restart" : "Update"}
          </span>
        </span>
      </IconButton>
      <UpdateInstallDialog onCancel={handleCancelInstall} onConfirm={handleConfirmInstall} open={installDialogOpen} version={state.version} />
    </>
  );
}
