import type {AppEnvironment} from "@/lib/app-environment";
import Icon from "@/components/ui/icon";
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
      <nav aria-label="Settings breadcrumb" className="flex h-12 shrink-0 items-center gap-1.5 px-5 text-sm sm:px-6">
        <span className="text-ink-faint">Settings</span>
        <Icon aria-hidden="true" className="text-ink-faint" name="chevron-right" size="xs" />
        <span className="truncate text-ink">{section.label}</span>
      </nav>
      <SettingsPageShell>
        <section.Component key={section.id} />
      </SettingsPageShell>
    </SidebarLayout>
  );
}
