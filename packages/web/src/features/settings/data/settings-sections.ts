import type {ComponentType} from "react";
import type {IconName} from "@/components/ui/icon";
import AppearanceSection from "@/features/settings/pages/sections/appearance-section";
import GeneralSection from "@/features/settings/pages/sections/general-section";
import ProvidersSection from "@/features/settings/pages/sections/providers-section";

export type SettingsSectionId = "appearance" | "general" | "providers";

export interface SettingsSection {
  Component: ComponentType;
  icon: IconName;
  id: SettingsSectionId;
  label: string;
}

export const settingsSections: readonly SettingsSection[] = [
  {
    Component: GeneralSection,
    icon: "settings",
    id: "general",
    label: "General",
  },
  {
    Component: AppearanceSection,
    icon: "palette",
    id: "appearance",
    label: "Appearance",
  },
  {
    Component: ProvidersSection,
    icon: "server",
    id: "providers",
    label: "Providers",
  },
];

export const defaultSettingsSectionId: SettingsSectionId = "general";

/** Returns the section for the given id. Throws for unknown ids. */
export function getSettingsSection(sectionId: string): SettingsSection {
  const section = settingsSections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`Unknown settings section: ${sectionId}`);
  return section;
}
