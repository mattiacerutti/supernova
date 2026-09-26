import SidebarLayout, {SidebarLayoutContent, SidebarLayoutSidebar, SidebarLayoutTitlebar} from "@/components/layouts/sidebar-layout";
import Icon from "@/components/ui/icon";
import SettingsSidebar from "@/features/settings/components/settings-sidebar";
import {getSettingsSection} from "@/features/settings/pages/settings-sections";

const SETTINGS_SIDEBAR_WIDTH = 288;

interface SettingsPageProps {
  readonly sectionId: string;
}

export default function SettingsPage(props: SettingsPageProps) {
  const {sectionId} = props;
  const section = getSettingsSection(sectionId);

  return (
    <SidebarLayout className="select-text" minSidebarWidth={SETTINGS_SIDEBAR_WIDTH} sidebarWidth={SETTINGS_SIDEBAR_WIDTH}>
      <SidebarLayoutTitlebar sidebarVisible />
      <SidebarLayoutSidebar>
        <SettingsSidebar activeSectionId={section.id} />
      </SidebarLayoutSidebar>
      <SidebarLayoutContent>
        <nav aria-label="Settings breadcrumb" className="flex h-12 shrink-0 items-center gap-1.5 px-5 text-sm sm:px-6">
          <span className="text-ink-faint">Settings</span>
          <Icon aria-hidden="true" className="text-ink-faint" name="chevron-right" size="xs" />
          <span className="truncate text-ink">{section.label}</span>
        </nav>
        <div className="scroll-fade-y min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-12 px-5 pb-12 pt-6 sm:px-6">
            <section.Component key={section.id} />
          </div>
        </div>
      </SidebarLayoutContent>
    </SidebarLayout>
  );
}
