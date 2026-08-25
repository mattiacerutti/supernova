import type {AppEnvironment} from "@/lib/app-environment";
import SidebarLayout from "@/features/sidebar/components/sidebar-layout";
import SettingsSidebar from "@/features/settings/components/sidebar/settings-sidebar";
import {getSettingsSection} from "@/features/settings/data/settings-sections";
import AppearanceSettingsPage from "@/features/settings/pages/settings/appearance-settings-page";
import ProvidersSettingsPage from "@/features/settings/pages/settings/providers-settings-page";

const SETTINGS_SIDEBAR_WIDTH = 288;

interface SettingsPageProps {
  appEnvironment: AppEnvironment;
  sectionId?: string;
}

export default function SettingsPage(props: SettingsPageProps) {
  const {appEnvironment, sectionId} = props;
  const section = getSettingsSection(sectionId);

  return (
    <SidebarLayout appEnvironment={appEnvironment} className="select-text" sidebar={<SettingsSidebar activeSectionId={section.id} />} sidebarWidth={SETTINGS_SIDEBAR_WIDTH}>
      <div className="h-12 shrink-0" />
      {section.id === "appearance" && <AppearanceSettingsPage />}
      {section.id === "providers" && <ProvidersSettingsPage />}
    </SidebarLayout>
  );
}
