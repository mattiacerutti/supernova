import SplitPageShell from "@/app/components/split-page-shell";
import SettingsPanel from "@/features/settings/components/settings-panel";
import SettingsSidebar from "@/features/settings/components/settings-sidebar";
import {getSettingsSection} from "@/features/settings/data/settings-sections";

interface ISettingsPageProps {
  integratedTitleBar: boolean;
  sectionId?: string;
}

export default function SettingsPage(props: ISettingsPageProps) {
  const {integratedTitleBar, sectionId} = props;
  const section = getSettingsSection(sectionId);

  return (
    <SplitPageShell integratedTitleBar={integratedTitleBar} sidebar={<SettingsSidebar activeSectionId={section.id} />}>
      <SettingsPanel section={section} />
    </SplitPageShell>
  );
}
