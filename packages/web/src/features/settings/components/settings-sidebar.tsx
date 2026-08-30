import {Link} from "@tanstack/react-router";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";
import {settingsSections} from "@/features/settings/data/settings-sections";
import type {SettingsSectionId} from "@/features/settings/data/settings-sections";

interface SettingsSidebarProps {
  activeSectionId: SettingsSectionId;
}

export default function SettingsSidebar(props: SettingsSidebarProps) {
  const {activeSectionId} = props;

  return (
    <aside className="flex h-full w-full shrink-0 flex-col md:w-72">
      <nav className="scroll-fade-y min-h-0 flex-1 overflow-y-auto px-3 pb-3 pt-1">
        <div className="space-y-0.5">
          <Link
            className="flex w-full items-center gap-2.5 rounded-xl corner-superellipse/1.3 px-2 py-1.5 text-left text-sm text-ink hover:bg-overlay-hover hover:text-ink-strong"
            to="/"
          >
            <Icon name="arrow-left" size="sm" />
            <span>Back to app</span>
          </Link>
        </div>

        <ul className="mt-4 space-y-0.5">
          {settingsSections.map((section) => {
            const isActive = section.id === activeSectionId;

            return (
              <li key={section.id}>
                <Link
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-xl corner-superellipse/1.3 px-2 py-1.5 text-left text-sm text-ink hover:bg-overlay-hover hover:text-ink-strong",
                    isActive && "bg-overlay-hover"
                  )}
                  params={{sectionId: section.id}}
                  to="/settings/$sectionId"
                >
                  <Icon name={section.icon} size="sm" />
                  <span>{section.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
