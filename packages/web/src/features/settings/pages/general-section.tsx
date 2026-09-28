import Button from "@/components/ui/button";
import Switch from "@/components/ui/switch";
import {SettingsGroup, SettingsRow} from "@/features/settings/components/settings-group";
import {useUpdateExtensions} from "@/features/settings/api/extensions/update-extensions";
import UpdateCheckButton from "@/features/updates/components/update-check-button";
import {showToast} from "@/lib/toast";
import {useSettingsStore} from "@/stores/settings-store";

export default function GeneralSection() {
  const captureCheckpoints = useSettingsStore((state) => state.captureCheckpoints);
  const confirmCheckpointConflicts = useSettingsStore((state) => state.confirmCheckpointConflicts);
  const setCaptureCheckpoints = useSettingsStore((state) => state.setCaptureCheckpoints);
  const setConfirmCheckpointConflicts = useSettingsStore((state) => state.setConfirmCheckpointConflicts);
  const updateExtensionsMutation = useUpdateExtensions();

  const handleUpdateExtensions = (): void => {
    updateExtensionsMutation.mutate(undefined, {
      onError: (error) => showToast("Couldn't update extensions", error.message),
      onSuccess: () => showToast("Extensions updated", "Your installed extensions are on their latest versions."),
    });
  };

  return (
    <>
      <SettingsGroup title="Git checkpoints">
        <SettingsRow
          control={<Switch aria-label="Capture workspace checkpoints" checked={captureCheckpoints} onCheckedChange={setCaptureCheckpoints} />}
          description="Snapshot workspace files at each turn so conversation navigation can restore them. Previously captured checkpoints stay restorable."
          title="Capture workspace checkpoints"
        />
        <SettingsRow
          control={<Switch aria-label="Ask before discarding conflicting changes" checked={confirmCheckpointConflicts} onCheckedChange={setConfirmCheckpointConflicts} />}
          description="Ask for confirmation when restoring a checkpoint would discard workspace changes made after it."
          title="Ask before discarding conflicting changes"
        />
      </SettingsGroup>

      <SettingsGroup title="Extensions">
        <SettingsRow
          control={
            <Button className="w-auto shrink-0 px-3 py-1.5 text-xs" disabled={updateExtensionsMutation.isPending} onClick={handleUpdateExtensions} size="sm" variant="filled">
              {updateExtensionsMutation.isPending ? "Updating..." : "Update"}
            </Button>
          }
          description="Get the latest versions of your installed extensions."
          title="Update extensions"
        />
      </SettingsGroup>

      {window.desktopApi && (
        <SettingsGroup title="About">
          <SettingsRow control={<UpdateCheckButton />} description={window.desktopApi.appVersion} title="Version" />
        </SettingsGroup>
      )}
    </>
  );
}
