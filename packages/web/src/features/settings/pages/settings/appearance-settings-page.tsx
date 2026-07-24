import Icon from "@/components/ui/icon";
import Input from "@/components/ui/input";
import Switch from "@/components/ui/switch";
import {SegmentedControl, SettingsCard, SettingsRow} from "@/features/settings/components/appearance/settings-controls";
import ThemePicker from "@/features/settings/components/appearance/theme-picker";
import {DEFAULT_CODE_FONT, DEFAULT_UI_FONT, useAppearanceStore} from "@/features/settings/stores/appearance-store";
import type {AppearanceMode} from "@/features/settings/stores/appearance-store";

const modeOptions: ReadonlyArray<{icon: React.ReactNode; label: string; value: AppearanceMode}> = [
  {icon: <Icon name="monitor" size="xs" />, label: "System", value: "system"},
  {icon: <Icon name="sun" size="xs" />, label: "Light", value: "light"},
  {icon: <Icon name="moon" size="xs" />, label: "Dark", value: "dark"},
];

/** Renders the app appearance settings. */
export default function AppearanceSettingsPage() {
  const codeFont = useAppearanceStore((state) => state.codeFont);
  const fontSmoothing = useAppearanceStore((state) => state.fontSmoothing);
  const mode = useAppearanceStore((state) => state.mode);
  const setCodeFont = useAppearanceStore((state) => state.setCodeFont);
  const setFontSmoothing = useAppearanceStore((state) => state.setFontSmoothing);
  const setMode = useAppearanceStore((state) => state.setMode);
  const setTranslucentSidebar = useAppearanceStore((state) => state.setTranslucentSidebar);
  const setUiFont = useAppearanceStore((state) => state.setUiFont);
  const translucentSidebar = useAppearanceStore((state) => state.translucentSidebar);
  const uiFont = useAppearanceStore((state) => state.uiFont);

  return (
    <div className="scroll-fade-y min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-ink-strong">Appearance</h1>
        <p className="mt-2 text-sm text-ink-muted">Customize Supernova’s theme and typography.</p>

        <div className="mt-10 space-y-8">
          <SettingsCard title="Theme">
            <SettingsRow control={<ThemePicker />} title="Theme" />
            <SettingsRow
              control={<SegmentedControl ariaLabel="Color mode" onChange={setMode} options={modeOptions} value={mode} />}
              description="Follow your system or choose a fixed appearance."
              title="Color mode"
            />
          </SettingsCard>

          <SettingsCard title="Typography and interface">
            <SettingsRow
              control={
                <Input
                  aria-label="UI font"
                  className="w-full py-1.5 sm:w-56"
                  onChange={(event) => setUiFont(event.currentTarget.value || undefined)}
                  placeholder={DEFAULT_UI_FONT}
                  spellCheck={false}
                  value={uiFont ?? ""}
                />
              }
              title="UI font"
            />
            <SettingsRow
              control={
                <Input
                  aria-label="Code font"
                  className="w-full py-1.5 sm:w-56"
                  onChange={(event) => setCodeFont(event.currentTarget.value || undefined)}
                  placeholder={DEFAULT_CODE_FONT}
                  spellCheck={false}
                  value={codeFont ?? ""}
                />
              }
              title="Code font"
            />
            <SettingsRow
              control={<Switch aria-label="Translucent sidebar" checked={translucentSidebar} onCheckedChange={setTranslucentSidebar} />}
              description="Let the desktop window material show through the sidebar."
              title="Translucent sidebar"
            />
            <SettingsRow
              control={<Switch aria-label="Enable font smoothing" checked={fontSmoothing} onCheckedChange={setFontSmoothing} />}
              description="Use antialiasing for lighter, crisper text rendering."
              title="Font smoothing"
            />
          </SettingsCard>
        </div>
      </div>
    </div>
  );
}
