import SettingsSidebar from "@/features/settings/components/sidebar/settings-sidebar";
import {getSettingsSection} from "@/features/settings/data/settings-sections";
import {cn} from "@/lib/cn";
import ProvidersSettingsPage from "@/features/settings/pages/settings/providers-settings-page";
import GeneralSettingsPage from "@/features/settings/pages/settings/general-settings-page";

interface ISettingsPageProps {
  integratedTitleBar: boolean;
  sectionId?: string;
}

export default function SettingsPage(props: ISettingsPageProps) {
  const {integratedTitleBar, sectionId} = props;
  const section = getSettingsSection(sectionId);

  return (
    <main className={cn("h-svh overflow-hidden text-neutral-200", integratedTitleBar && "desktop-window")}>
      <section className={cn("relative flex h-full min-h-0 overflow-hidden", integratedTitleBar ? "desktop-window-frame bg-[#282829]/80" : "bg-[#282829]")}>
        <div className={cn("shrink-0 overflow-hidden transition-[width] duration-200 ease-out w-full md:w-72")}>
          <SettingsSidebar activeSectionId={section.id} />
        </div>
        <section className="app-panel flex h-full min-h-0 flex-1 flex-col border-l-[0.1px] bg-[#181818] pt-14 border-white/22 rounded-xl" data-sidebar-visible={true}>
          {section.id === "providers" && <ProvidersSettingsPage />}
          {section.id === "general" && <GeneralSettingsPage section={section} />}
        </section>
      </section>
    </main>
  );
}
