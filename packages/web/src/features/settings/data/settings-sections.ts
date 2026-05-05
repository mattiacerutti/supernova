import type {IconName} from "@/components/ui/icon";

export type SettingsSectionId = "general" | "providers";

export interface ISettingsSection {
  description: string;
  icon: IconName;
  id: SettingsSectionId;
  label: string;
}

export const defaultSettingsSectionId: SettingsSectionId = "general";

export const settingsSections: ISettingsSection[] = [
  {
    description: "Configure app-level preferences and default behavior.",
    icon: "settings",
    id: "general",
    label: "General",
  },
  {
    description: "Manage model providers and API keys.",
    icon: "server",
    id: "providers",
    label: "Providers",
  },
];

export function getSettingsSection(sectionId?: string): ISettingsSection {
  const defaultSection = settingsSections.find((section) => section.id === defaultSettingsSectionId);
  if (!defaultSection) {
    throw new Error("Default settings section is missing.");
  }

  return settingsSections.find((section) => section.id === sectionId) || defaultSection;
}
