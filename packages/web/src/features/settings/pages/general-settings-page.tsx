import type {ISettingsSection} from "@/features/settings/data/settings-sections";

interface IGeneralSettingsPageProps {
  section: ISettingsSection;
}

export default function GeneralSettingsPage(props: IGeneralSettingsPageProps) {
  const {section} = props;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-200">{section.label}</h1>
      </div>
    </div>
  );
}
