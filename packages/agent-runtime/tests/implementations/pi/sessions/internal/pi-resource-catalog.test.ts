import type {PromptTemplate, ResourceLoader, Skill} from "@earendil-works/pi-coding-agent";
import {Effect, Layer} from "effect";
import {describe, expect, it, vi} from "vitest";
import {PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import type {PiSdkServiceShape} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {PiResourceCatalog, PiResourceCatalogLive} from "@supernova/agent-runtime/implementations/pi/sessions/internal/pi-resource-catalog";

const skill = {
  baseDir: "/workspace/.agents/skills/example",
  description: "Example skill",
  disableModelInvocation: false,
  filePath: "/workspace/.agents/skills/example/SKILL.md",
  name: "example",
} as Skill;

const promptTemplate = {
  content: "Ignored prompt template",
  description: "Ignored",
  filePath: "/workspace/.pi/prompts/ignored.md",
  name: "ignored",
} as PromptTemplate;

describe("Pi resource catalog", () => {
  it("loads skills and prompt templates through the SDK resource loader abstraction", async () => {
    const resourceLoader = {
      getPrompts: vi.fn(() => ({diagnostics: [], prompts: [promptTemplate]})),
      getSkills: vi.fn(() => ({diagnostics: [], skills: [skill]})),
      reload: vi.fn(async () => undefined),
    } as unknown as ResourceLoader;
    const piSdk = {
      createResourceLoader: vi.fn(() => resourceLoader),
    } as unknown as PiSdkServiceShape;
    const catalog = await runCatalog(piSdk);

    await expect(catalog.listSkills("/workspace")).resolves.toEqual([skill]);
    await expect(catalog.listPromptTemplates("/workspace")).resolves.toEqual([promptTemplate]);

    expect(piSdk.createResourceLoader).toHaveBeenNthCalledWith(1, {projectPath: "/workspace"});
    expect(piSdk.createResourceLoader).toHaveBeenNthCalledWith(2, {projectPath: "/workspace"});
    expect(resourceLoader.reload).toHaveBeenCalledTimes(2);
    expect(resourceLoader.getSkills).toHaveBeenCalledOnce();
    expect(resourceLoader.getPrompts).toHaveBeenCalledOnce();
  });
});

function runCatalog(piSdk: PiSdkServiceShape) {
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* PiResourceCatalog;
    }).pipe(Effect.provide(PiResourceCatalogLive.pipe(Layer.provide(Layer.succeed(PiSdkService, piSdk)))))
  );
}
