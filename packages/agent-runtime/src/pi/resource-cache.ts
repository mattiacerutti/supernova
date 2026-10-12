import {readFile} from "node:fs/promises";
import type {LoadExtensionsResult, PromptTemplate, ResourceLoader, Skill} from "@earendil-works/pi-coding-agent";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

/** What a project's agents are built from, loaded once. */
export interface ProjectResources {
  readonly contextFiles: readonly {readonly path: string; readonly content: string}[];
  readonly extensions: LoadExtensionsResult;
  readonly promptTemplates: readonly PromptTemplate[];
  readonly skills: readonly Skill[];
}

export interface ResourceCache {
  readonly initialize: (projectPath: string) => Promise<void>;
  /** Drops every loaded project so the next request rediscovers resources, e.g. after packages change on disk. */
  readonly invalidate: () => void;
  /** Everything one project's agents are built from. */
  readonly load: (projectPath: string) => Promise<ProjectResources>;
  readonly listPromptTemplates: (projectPath: string) => Promise<readonly PromptTemplate[]>;
  readonly listSkills: (projectPath: string) => Promise<readonly Skill[]>;
  readonly readSkillContent: (skill: Skill) => Promise<string>;
}

function resourcesOf(loader: ResourceLoader): ProjectResources {
  return {
    contextFiles: loader.getAgentsFiles().agentsFiles,
    extensions: loader.getExtensions(),
    promptTemplates: loader.getPrompts().prompts,
    skills: loader.getSkills().skills,
  };
}

/** Loads each project's extensions, prompts, skills, and context files once and serves them from memory. */
export function createResourceCache(sdk: Pick<PiSdk, "loadResourceLoader">): ResourceCache {
  const loaded = new Map<string, Promise<ProjectResources>>();

  const load = (projectPath: string): Promise<ProjectResources> => {
    let resources = loaded.get(projectPath);
    if (!resources) {
      resources = (async () => {
        const loader = await sdk.loadResourceLoader({projectPath});
        const {errors} = loader.getExtensions();
        if (errors.length > 0) throw new Error(errors.map(({path, error}) => `${path}: ${error}`).join("\n"));
        return resourcesOf(loader);
      })().catch((error) => {
        loaded.delete(projectPath);
        throw error;
      });
      loaded.set(projectPath, resources);
    }
    return resources;
  };

  return {
    initialize: async (projectPath) => {
      await load(projectPath);
    },
    invalidate: () => loaded.clear(),
    load,
    listPromptTemplates: async (projectPath) => (await load(projectPath)).promptTemplates,
    listSkills: async (projectPath) => (await load(projectPath)).skills,
    readSkillContent: (skill) => readFile(skill.filePath, "utf8"),
  };
}
