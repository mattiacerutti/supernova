import SplitPageShell from "@/app/components/split-page-shell";
import SettingsSidebar from "@/features/settings/components/sidebar/settings-sidebar";
import {getSettingsSection} from "@/features/settings/data/settings-sections";
import GeneralSettingsPage from "@/features/settings/pages/general-settings-page";
import ProvidersSettingsPage from "@/features/settings/pages/providers-settings-page";

interface ISettingsPageProps {
  integratedTitleBar: boolean;
  sectionId?: string;
}

export default function SettingsPage(props: ISettingsPageProps) {
  const {integratedTitleBar, sectionId} = props;
  const section = getSettingsSection(sectionId);

  return (
    <SplitPageShell integratedTitleBar={integratedTitleBar} sidebar={<SettingsSidebar activeSectionId={section.id} />}>
      {section.id === "providers" && <ProvidersSettingsPage />}
      {section.id === "general" && <GeneralSettingsPage section={section} />}
    </SplitPageShell>
  );
}
