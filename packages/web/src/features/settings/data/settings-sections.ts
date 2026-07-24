import type {IconName} from "@/components/ui/icon";

export type SettingsSectionId = "appearance" | "providers";

export interface SettingsSection {
  description: string;
  icon: IconName;
  id: SettingsSectionId;
  label: string;
}

const defaultSettingsSection: SettingsSection = {
  description: "Customize the theme, typography, and interface styling.",
  icon: "palette",
  id: "appearance",
  label: "Appearance",
};

export const settingsSections: SettingsSection[] = [
  defaultSettingsSection,
  {
    description: "Manage model providers and API keys.",
    icon: "server",
    id: "providers",
    label: "Providers",
  },
];

export function getSettingsSection(sectionId?: string): SettingsSection {
  return settingsSections.find((section) => section.id === sectionId) ?? defaultSettingsSection;
}
