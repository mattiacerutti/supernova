import {readFileSync} from "node:fs";
import {homedir} from "node:os";
import {resolve} from "node:path";
import {DefaultResourceLoader, getAgentDir} from "@earendil-works/pi-coding-agent";
import {loadPiSettings} from "@supernova/agent-runtime/layers/shared/lib/pi-settings";

/** Uses Pi's extension, package, and skill discovery while leaving themes and prompt templates disabled. */
export class CustomPiResourceLoader extends DefaultResourceLoader {
  constructor(projectPath: string) {
    super({
      agentDir: getAgentDir(),
      cwd: projectPath,
      settingsManager: loadPiSettings(projectPath),
      noPromptTemplates: true,
      noThemes: true,
      systemPrompt: "",
      appendSystemPrompt: [],
      agentsFilesOverride: (current) => {
        const path = resolve(process.env.HOME || homedir(), ".agents", "AGENTS.md");
        if (current.agentsFiles.some((file) => file.path === path)) return current;

        try {
          // Shared user instructions precede Supernova-specific and project instructions.
          const content = readFileSync(path, "utf-8");
          return {agentsFiles: [{path, content}, ...current.agentsFiles]};
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            console.warn(`Warning: Could not read ${path}: ${error}`);
          }
          return current;
        }
      },
    });
  }
}
