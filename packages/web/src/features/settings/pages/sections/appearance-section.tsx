import Input from "@/components/ui/input";
import Switch from "@/components/ui/switch";
import ModePicker from "@/features/settings/components/appearance/mode-picker";
import ThemeLibrary from "@/features/settings/components/appearance/theme-library";
import {SettingsGroup, SettingsRow} from "@/features/settings/components/settings-group";
import {DEFAULT_CODE_FONT, DEFAULT_UI_FONT, useAppearanceStore} from "@/features/settings/stores/appearance-store";

export default function AppearanceSection() {
  const codeFont = useAppearanceStore((state) => state.codeFont);
  const fontSmoothing = useAppearanceStore((state) => state.fontSmoothing);
  const setCodeFont = useAppearanceStore((state) => state.setCodeFont);
  const setFontSmoothing = useAppearanceStore((state) => state.setFontSmoothing);
  const setTranslucentSidebar = useAppearanceStore((state) => state.setTranslucentSidebar);
  const setUiFont = useAppearanceStore((state) => state.setUiFont);
  const translucentSidebar = useAppearanceStore((state) => state.translucentSidebar);
  const uiFont = useAppearanceStore((state) => state.uiFont);

  return (
    <>
      <SettingsGroup title="Theme">
        <SettingsRow description="Pick the colors used across the interface." title="Color palette">
          <div className="max-w-xl">
            <ThemeLibrary />
          </div>
        </SettingsRow>
        <SettingsRow description="Choose how the theme follows your system appearance." title="Color mode">
          <div className="max-w-xl">
            <ModePicker />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Typography">
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
          description="Font used across the interface. Leave empty for the system default."
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
          description="Font used for code blocks, tool output, and diffs. Leave empty for the default monospace."
          title="Code font"
        />
        <SettingsRow
          control={<Switch aria-label="Enable font smoothing" checked={fontSmoothing} onCheckedChange={setFontSmoothing} />}
          description="Use antialiasing for lighter, crisper text rendering."
          title="Font smoothing"
        />
      </SettingsGroup>

      <SettingsGroup title="Interface">
        <SettingsRow
          control={<Switch aria-label="Translucent sidebar" checked={translucentSidebar} onCheckedChange={setTranslucentSidebar} />}
          description="Let the desktop window material show through the sidebar."
          title="Translucent sidebar"
        />
      </SettingsGroup>
    </>
  );
}
