import type {ISettingsSection} from "@/features/settings/data/settings-sections";

interface ISettingsPanelProps {
  section: ISettingsSection;
}

export default function SettingsPanel(props: ISettingsPanelProps) {
  const {section} = props;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-white">{section.label}</h1>
      </div>
    </div>
  );
}
