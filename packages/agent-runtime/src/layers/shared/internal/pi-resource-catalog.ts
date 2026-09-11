import {readFile} from "node:fs/promises";
import type {PromptTemplate, ResourceLoader, Skill} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";

export interface PiResourceCatalogShape {
  readonly initialize: (projectPath: string) => Promise<void>;
  readonly listPromptTemplates: (projectPath: string) => Promise<readonly PromptTemplate[]>;
  readonly listSkills: (projectPath: string) => Promise<readonly Skill[]>;
  readonly readSkillContent: (skill: Skill) => Promise<string>;
}

/** Private capability for loading project resources once for discovery. */
export class PiResourceCatalog extends Context.Service<PiResourceCatalog, PiResourceCatalogShape>()("supernova/agent-runtime/PiResourceCatalog") {}

export const PiResourceCatalogLive = Layer.effect(
  PiResourceCatalog,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    const loaders = new Map<string, Promise<ResourceLoader>>();

    function load(projectPath: string): Promise<ResourceLoader> {
      if (!loaders.has(projectPath)) {
        loaders.set(
          projectPath,
          (async () => {
            const loader = await piSdk.loadResourceLoader({projectPath});
            const {errors} = loader.getExtensions();
            if (errors.length > 0) throw new Error(errors.map(({path, error}) => `${path}: ${error}`).join("\n"));
            return loader;
          })().catch((error) => {
            loaders.delete(projectPath);
            throw error;
          })
        );
      }
      return loaders.get(projectPath)!;
    }

    return {
      initialize: async (projectPath) => {
        await load(projectPath);
      },
      listPromptTemplates: async (projectPath) => (await load(projectPath)).getPrompts().prompts,
      listSkills: async (projectPath) => (await load(projectPath)).getSkills().skills,
      readSkillContent: (skill) => readFile(skill.filePath, "utf8"),
    };
  })
);
