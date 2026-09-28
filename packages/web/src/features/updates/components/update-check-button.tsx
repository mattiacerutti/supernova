import {useState} from "react";
import Button from "@/components/ui/button";
import {showToast} from "@/lib/toast";
import UpdateInstallDialog from "@/features/updates/components/update-install-dialog";
import {useDesktopUpdate} from "@/features/updates/hooks/use-desktop-update";

/** Settings control that walks the whole update flow in place: check, download, then restart to install. */
export default function UpdateCheckButton() {
  const {state, check, download, install} = useDesktopUpdate();
  const [pending, setPending] = useState(false);
  const [installDialogOpen, setInstallDialogOpen] = useState(false);

  const status = state?.status ?? "idle";
  const downloadable = status === "available" || (status === "error" && state?.version != null);

  const label =
    status === "checking"
      ? "Checking..."
      : status === "downloading"
        ? `Downloading ${state?.downloadPercent ?? 0}%`
        : status === "downloaded"
          ? "Restart to update"
          : downloadable
            ? `Download ${state?.version ?? "update"}`
            : "Check for updates";

  const runAction = (action: () => Promise<void>, failureTitle: string): void => {
    setPending(true);
    void action()
      .catch(() => showToast(failureTitle, "Restart Supernova and try again."))
      .finally(() => setPending(false));
  };

  const handleCheck = async (): Promise<void> => {
    const result = await check();
    // Failed checks are already reported by useDesktopUpdate; an offered update changes this button to Download.
    if (result === null) showToast("Updates aren't available", "This build of Supernova can't update itself.");
    else if (result.status === "idle") showToast("Supernova is up to date", `You're on the latest version, ${window.desktopApi?.appVersion}.`);
  };

  const handleClick = (): void => {
    if (status === "downloaded") setInstallDialogOpen(true);
    else if (downloadable) runAction(download, "Could not download the update");
    else runAction(handleCheck, "Could not check for updates");
  };

  const handleConfirmInstall = (): void => {
    setInstallDialogOpen(false);
    runAction(install, "Could not install the update");
  };

  return (
    <>
      <Button
        className="w-auto shrink-0 px-3 py-1.5 text-xs"
        disabled={!state || pending || status === "checking" || status === "downloading"}
        onClick={handleClick}
        size="sm"
        variant="filled"
      >
        {label}
      </Button>
      <UpdateInstallDialog onCancel={() => setInstallDialogOpen(false)} onConfirm={handleConfirmInstall} open={installDialogOpen} version={state?.version ?? null} />
    </>
  );
}
