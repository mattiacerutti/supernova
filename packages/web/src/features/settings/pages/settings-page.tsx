import type {AppEnvironment} from "@/app/app-environment";
import {isDesktopEnvironment, isMacEnvironment} from "@/app/app-environment";
import SettingsSidebar from "@/features/settings/components/sidebar/settings-sidebar";
import {getSettingsSection} from "@/features/settings/data/settings-sections";
import {cn} from "@/lib/cn";
import AppearanceSettingsPage from "@/features/settings/pages/settings/appearance-settings-page";
import ProvidersSettingsPage from "@/features/settings/pages/settings/providers-settings-page";

interface SettingsPageProps {
  appEnvironment: AppEnvironment;
  sectionId?: string;
}

export default function SettingsPage(props: SettingsPageProps) {
  const {appEnvironment, sectionId} = props;
  const section = getSettingsSection(sectionId);
  const desktopEnvironment = isDesktopEnvironment(appEnvironment);
  const macEnvironment = isMacEnvironment(appEnvironment);

  return (
    <main className={cn("h-svh select-text overflow-hidden text-ink", desktopEnvironment && "desktop-window")}>
      <section className={cn("relative flex h-full min-h-0 overflow-hidden", desktopEnvironment ? "desktop-window-frame desktop-sidebar-background" : "bg-surface-contrast")}>
        {macEnvironment && <div className="desktop-titlebar absolute inset-x-0 top-0 z-10 h-12" />}
        <div className="w-72 shrink-0 overflow-hidden">
          <SettingsSidebar activeSectionId={section.id} />
        </div>
        <section className="app-panel flex h-full min-h-0 min-w-0 flex-1 flex-col rounded-xl border-l-[0.1px] border-border-strong bg-surface pt-14" data-sidebar-visible={true}>
          {section.id === "appearance" && <AppearanceSettingsPage />}
          {section.id === "providers" && <ProvidersSettingsPage />}
        </section>
      </section>
    </main>
  );
}
