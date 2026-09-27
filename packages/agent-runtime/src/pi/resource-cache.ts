import {readFile} from "node:fs/promises";
import type {PromptTemplate, ResourceLoader, Skill} from "@earendil-works/pi-coding-agent";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface ResourceCache {
  readonly initialize: (projectPath: string) => Promise<void>;
  readonly listPromptTemplates: (projectPath: string) => Promise<readonly PromptTemplate[]>;
  readonly listSkills: (projectPath: string) => Promise<readonly Skill[]>;
  readonly readSkillContent: (skill: Skill) => Promise<string>;
}

/** Loads each project's extensions, prompts, and skills once and serves them from memory. */
export function createResourceCache(sdk: Pick<PiSdk, "loadResourceLoader">): ResourceCache {
  const loaders = new Map<string, Promise<ResourceLoader>>();

  const load = (projectPath: string): Promise<ResourceLoader> => {
    let loader = loaders.get(projectPath);
    if (!loader) {
      loader = (async () => {
        const loaded = await sdk.loadResourceLoader({projectPath});
        const {errors} = loaded.getExtensions();
        if (errors.length > 0) throw new Error(errors.map(({path, error}) => `${path}: ${error}`).join("\n"));
        return loaded;
      })().catch((error) => {
        loaders.delete(projectPath);
        throw error;
      });
      loaders.set(projectPath, loader);
    }
    return loader;
  };

  return {
    initialize: async (projectPath) => {
      await load(projectPath);
    },
    listPromptTemplates: async (projectPath) => (await load(projectPath)).getPrompts().prompts,
    listSkills: async (projectPath) => (await load(projectPath)).getSkills().skills,
    readSkillContent: (skill) => readFile(skill.filePath, "utf8"),
  };
}
