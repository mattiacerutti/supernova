import {readFile} from "node:fs/promises";
import type {PromptTemplate, Skill} from "@earendil-works/pi-coding-agent";
import {Context, Effect, Layer} from "effect";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";

export interface PiResourceCatalogShape {
  readonly listPromptTemplates: (projectPath: string) => Promise<readonly PromptTemplate[]>;
  readonly listSkills: (projectPath: string) => Promise<readonly Skill[]>;
  readonly readSkillContent: (skill: Skill) => Promise<string>;
}

/** Private capability for loading Pi skills and prompt templates. */
export class PiResourceCatalog extends Context.Service<PiResourceCatalog, PiResourceCatalogShape>()("supernova/agent-runtime/PiResourceCatalog") {}

export const PiResourceCatalogLive = Layer.effect(
  PiResourceCatalog,
  Effect.gen(function* () {
    const piSdk = yield* PiSdkService;

    return {
      listPromptTemplates: async (projectPath) => {
        const resourceLoader = piSdk.createResourceLoader({projectPath});
        await resourceLoader.reload();
        return resourceLoader.getPrompts().prompts;
      },
      listSkills: async (projectPath) => {
        const resourceLoader = piSdk.createResourceLoader({projectPath});
        await resourceLoader.reload();
        return resourceLoader.getSkills().skills;
      },
      readSkillContent: (skill) => readFile(skill.filePath, "utf8"),
    };
  })
);
