import Switch from "@/components/ui/switch";
import {SettingsGroup, SettingsRow} from "@/features/settings/components/settings-group";
import {useSettingsStore} from "@/stores/settings-store";

export default function GeneralSection() {
  const captureCheckpoints = useSettingsStore((state) => state.captureCheckpoints);
  const confirmCheckpointConflicts = useSettingsStore((state) => state.confirmCheckpointConflicts);
  const setCaptureCheckpoints = useSettingsStore((state) => state.setCaptureCheckpoints);
  const setConfirmCheckpointConflicts = useSettingsStore((state) => state.setConfirmCheckpointConflicts);

  return (
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
  );
}
