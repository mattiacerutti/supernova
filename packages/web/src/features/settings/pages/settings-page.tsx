import type {AppEnvironment} from "@/lib/app-environment";
import SidebarLayout from "@/features/sidebar/components/sidebar-layout";
import SettingsPageShell from "@/features/settings/components/settings-page-shell";
import SettingsSidebar from "@/features/settings/components/settings-sidebar";
import {getSettingsSection} from "@/features/settings/data/settings-sections";

const SETTINGS_SIDEBAR_WIDTH = 288;

interface SettingsPageProps {
  appEnvironment: AppEnvironment;
  sectionId: string;
}

export default function SettingsPage(props: SettingsPageProps) {
  const {appEnvironment, sectionId} = props;
  const section = getSettingsSection(sectionId);

  return (
    <SidebarLayout appEnvironment={appEnvironment} className="select-text" sidebar={<SettingsSidebar activeSectionId={section.id} />} sidebarWidth={SETTINGS_SIDEBAR_WIDTH}>
      <div className="h-12 shrink-0" />
      <SettingsPageShell description={section.description} icon={section.icon} title={section.label}>
        <section.Component key={section.id} />
      </SettingsPageShell>
    </SidebarLayout>
  );
}
