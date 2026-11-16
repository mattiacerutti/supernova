import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import Input from "@/components/ui/input";
import Menu, {MenuItem} from "@/components/ui/menu";
import Switch from "@/components/ui/switch";
import FontSizePicker from "@/features/settings/components/appearance/font-size-picker";
import ModePicker from "@/features/settings/components/appearance/mode-picker";
import ThemeLibrary from "@/features/settings/components/appearance/theme-library";
import {SettingsGroup, SettingsRow} from "@/features/settings/components/settings-group";
import {CONVERSATION_WIDTHS, DEFAULT_CODE_FONT, DEFAULT_UI_FONT, useSettingsStore} from "@/stores/settings-store";

const WIDTH_LABELS = {comfortable: "Comfortable", wide: "Wide", full: "Full width"} as const;

export default function AppearanceSection() {
  const conversationWidth = useSettingsStore((state) => state.conversationWidth);
  const setConversationWidth = useSettingsStore((state) => state.setConversationWidth);
  const codeFont = useSettingsStore((state) => state.codeFont);
  const fontSmoothing = useSettingsStore((state) => state.fontSmoothing);
  const setCodeFont = useSettingsStore((state) => state.setCodeFont);
  const setFontSmoothing = useSettingsStore((state) => state.setFontSmoothing);
  const setTranslucentSidebar = useSettingsStore((state) => state.setTranslucentSidebar);
  const setUiFont = useSettingsStore((state) => state.setUiFont);
  const translucentSidebar = useSettingsStore((state) => state.translucentSidebar);
  const uiFont = useSettingsStore((state) => state.uiFont);

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
          control={<FontSizePicker label="Interface font size" target="interface" />}
          description="Make text and controls smaller or larger throughout the app."
          title="Interface font size"
        />
        <SettingsRow
          control={<FontSizePicker label="Code and diff font size" target="code" />}
          description="Adjust text size in code blocks, files, diffs, and tool output."
          title="Code and diff font size"
        />
        <SettingsRow control={<FontSizePicker label="Terminal font size" target="terminal" />} description="Adjust the text size in terminals." title="Terminal font size" />
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
          control={
            <Menu
              trigger={(triggerProps) => (
                <Button {...triggerProps} className="w-auto shrink-0 px-3 py-1.5 text-xs" size="sm" variant="filled">
                  {WIDTH_LABELS[conversationWidth]}
                  <Icon name="chevron-down" size="xs" />
                </Button>
              )}
              triggerLabel="Conversation width"
            >
              {(Object.keys(CONVERSATION_WIDTHS) as Array<keyof typeof CONVERSATION_WIDTHS>).map((width) => (
                <MenuItem key={width} onClick={() => setConversationWidth(width)} trailing={conversationWidth === width && <Icon name="check" size="xs" />}>
                  {WIDTH_LABELS[width]}
                </MenuItem>
              ))}
            </Menu>
          }
          description="Keep conversations narrow or use more of the available space."
          title="Conversation width"
        />
        <SettingsRow
          control={<Switch aria-label="Translucent sidebar" checked={translucentSidebar} onCheckedChange={setTranslucentSidebar} />}
          description="Let the desktop window material show through the sidebar."
          title="Translucent sidebar"
        />
      </SettingsGroup>
    </>
  );
}
