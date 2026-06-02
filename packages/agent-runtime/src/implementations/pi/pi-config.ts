import {resolve, sep} from "node:path";
import {DefaultPackageManager, DefaultResourceLoader, getAgentDir, SettingsManager} from "@earendil-works/pi-coding-agent";
import type {ResourceLoader} from "@earendil-works/pi-coding-agent";

function isAgentsSkillPath(path: string): boolean {
  const parts = resolve(path).split(sep);
  const agentsIndex = parts.lastIndexOf(".agents");
  return agentsIndex !== -1 && parts[agentsIndex + 1] === "skills";
}

async function resolvePiDiscoveredAgentsSkillPaths(input: {readonly agentDir: string; readonly projectPath: string; readonly settingsManager: SettingsManager}): Promise<string[]> {
  const resolvedPaths = await new DefaultPackageManager({cwd: input.projectPath, agentDir: input.agentDir, settingsManager: input.settingsManager}).resolve();

  // Pi discovers both .pi and .agents skills in its package manager. We want to keep
  // Pi's .agents discovery semantics, then pass only those paths into the real
  // loader so .pi skills are never parsed or exposed.
  return resolvedPaths.skills
    .filter((resource) => resource.enabled && resource.metadata.origin === "top-level" && isAgentsSkillPath(resource.path))
    .map((resource) => resource.path);
}

function createRestrictedPiResourceLoader(input: {
  readonly agentDir: string;
  readonly projectPath: string;
  readonly settingsManager: SettingsManager;
  readonly skillPaths: string[];
}): ResourceLoader {
  return new DefaultResourceLoader({
    additionalSkillPaths: input.skillPaths,
    agentDir: input.agentDir,
    cwd: input.projectPath,
    noExtensions: true,
    noPromptTemplates: true,
    noSkills: true,
    noThemes: true,
    settingsManager: input.settingsManager,
    systemPrompt: "",
    appendSystemPrompt: [],
  });
}

/** ResourceLoader that reuses Pi discovery but only exposes certain resources (eg. no extensions, no themes). */
export class CustomPiResourceLoader implements ResourceLoader {
  private readonly agentDir: string;
  private readonly projectPath: string;
  private readonly settingsManager = SettingsManager.inMemory();
  private piLoader: ResourceLoader;

  constructor(projectPath: string) {
    this.agentDir = getAgentDir();
    this.projectPath = projectPath;
    this.piLoader = createRestrictedPiResourceLoader({agentDir: this.agentDir, projectPath, settingsManager: this.settingsManager, skillPaths: []});
  }

  getExtensions(): ReturnType<ResourceLoader["getExtensions"]> {
    return this.piLoader.getExtensions();
  }

  getSkills(): ReturnType<ResourceLoader["getSkills"]> {
    return this.piLoader.getSkills();
  }

  getPrompts(): ReturnType<ResourceLoader["getPrompts"]> {
    return this.piLoader.getPrompts();
  }

  getThemes(): ReturnType<ResourceLoader["getThemes"]> {
    return this.piLoader.getThemes();
  }

  getAgentsFiles(): ReturnType<ResourceLoader["getAgentsFiles"]> {
    return this.piLoader.getAgentsFiles();
  }

  getSystemPrompt(): ReturnType<ResourceLoader["getSystemPrompt"]> {
    return this.piLoader.getSystemPrompt();
  }

  getAppendSystemPrompt(): ReturnType<ResourceLoader["getAppendSystemPrompt"]> {
    return this.piLoader.getAppendSystemPrompt();
  }

  extendResources(paths: Parameters<ResourceLoader["extendResources"]>[0]): void {
    this.piLoader.extendResources(paths);
  }

  async reload(): Promise<void> {
    const skillPaths = await resolvePiDiscoveredAgentsSkillPaths({agentDir: this.agentDir, projectPath: this.projectPath, settingsManager: this.settingsManager});

    this.piLoader = createRestrictedPiResourceLoader({agentDir: this.agentDir, projectPath: this.projectPath, settingsManager: this.settingsManager, skillPaths});

    await this.piLoader.reload();
  }
}
