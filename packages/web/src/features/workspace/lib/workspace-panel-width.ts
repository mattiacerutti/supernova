import type {AppEnvironment} from "@/lib/app-environment";

export const MIN_WORKSPACE_PANEL_WIDTH = 280;
const WINDOWS_WINDOW_CONTROLS_WIDTH = 138;

/** Windows overlays its window controls on the panel header. */
export function minWorkspacePanelWidth(appEnvironment: AppEnvironment): number {
  return appEnvironment === "windows" ? MIN_WORKSPACE_PANEL_WIDTH + WINDOWS_WINDOW_CONTROLS_WIDTH : MIN_WORKSPACE_PANEL_WIDTH;
}
