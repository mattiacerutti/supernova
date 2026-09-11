import {SettingsManager} from "@earendil-works/pi-coding-agent";

/** Reads Pi's merged file settings without loading resources or persisting changes; no project means global-only. */
export function loadPiSettings(projectPath?: string, agentDir?: string): SettingsManager {
  // Preserve Supernova's existing project policy, but never load the server cwd's project settings for a global request.
  const settings = SettingsManager.create(projectPath ?? process.cwd(), agentDir, {projectTrusted: projectPath !== undefined});
  const errors = settings.drainErrors();
  if (errors.length > 0) {
    throw new Error(`Could not load ${errors.map(({scope}) => scope).join(" and ")} settings.json. Check that the files are readable and contain valid JSON.`);
  }
  return settings;
}
