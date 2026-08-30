import type {ComponentType} from "react";
import type {IconName} from "@/components/ui/icon";
import AppearanceSection from "@/features/settings/pages/sections/appearance-section";
import ProvidersSection from "@/features/settings/pages/sections/providers-section";

export type SettingsSectionId = "appearance" | "providers";

export interface SettingsSection {
  Component: ComponentType;
  description: string;
  icon: IconName;
  id: SettingsSectionId;
  label: string;
}

export const settingsSections: readonly SettingsSection[] = [
  {
    Component: AppearanceSection,
    description: "Customize Supernova's theme, typography, and interface.",
    icon: "palette",
    id: "appearance",
    label: "Appearance",
  },
  {
    Component: ProvidersSection,
    description: "Connect model providers and manage their credentials.",
    icon: "server",
    id: "providers",
    label: "Providers",
  },
];

export const defaultSettingsSectionId: SettingsSectionId = "appearance";

/** Returns the section for the given id. Throws for unknown ids. */
export function getSettingsSection(sectionId: string): SettingsSection {
  const section = settingsSections.find((candidate) => candidate.id === sectionId);
  if (!section) throw new Error(`Unknown settings section: ${sectionId}`);
  return section;
}
