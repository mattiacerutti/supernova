import type {PromptTemplate, ResourceLoader, Skill} from "@earendil-works/pi-coding-agent";
import {describe, expect, it, vi} from "vitest";
import {createResourceCache} from "@supernova/agent-runtime/pi/resource-cache";

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

describe("Pi resource cache", () => {
  it.each(["construction", "reload", "extensions"] as const)("retries after a %s failure and shares the successful loader", async (failure) => {
    const error = new Error("Broken resource configuration");
    let repaired = false;
    const resourceLoader = {
      getAgentsFiles: () => ({agentsFiles: []}),
      getExtensions: () => ({errors: !repaired && failure === "extensions" ? [{path: "extension.ts", error: error.message}] : []}),
      getPrompts: () => ({diagnostics: [], prompts: [promptTemplate]}),
      getSkills: () => ({diagnostics: [], skills: [skill]}),
      reload: async () => {
        if (!repaired && failure === "reload") throw error;
      },
    } as unknown as ResourceLoader;
    const createResourceLoader = vi.fn(() => {
      if (!repaired && failure === "construction") throw error;
      return resourceLoader;
    });
    const catalog = await runCatalog({createResourceLoader} as unknown as LoaderFactory);

    const failures = await Promise.allSettled([catalog.listSkills("/workspace"), catalog.listPromptTemplates("/workspace")]);
    for (const result of failures) {
      expect(result).toMatchObject({status: "rejected", reason: expect.objectContaining({message: expect.stringContaining(error.message)})});
    }
    expect(createResourceLoader).toHaveBeenCalledTimes(1);

    repaired = true;
    expect(await Promise.all([catalog.listSkills("/workspace"), catalog.listPromptTemplates("/workspace")])).toEqual([[skill], [promptTemplate]]);
    expect(await catalog.listSkills("/workspace")).toEqual([skill]);
    expect(createResourceLoader).toHaveBeenCalledTimes(2);
  });

  it("loads skills and prompt templates through the SDK resource loader abstraction", async () => {
    const resourceLoader = {
      getAgentsFiles: () => ({agentsFiles: []}),
      getExtensions: vi.fn(() => ({errors: []})),
      getPrompts: vi.fn(() => ({diagnostics: [], prompts: [promptTemplate]})),
      getSkills: vi.fn(() => ({diagnostics: [], skills: [skill]})),
      reload: vi.fn(async () => undefined),
    } as unknown as ResourceLoader;
    const piSdk = {
      createResourceLoader: vi.fn(() => resourceLoader),
    } as unknown as LoaderFactory;
    const catalog = await runCatalog(piSdk);

    const [skills, prompts] = await Promise.all([catalog.listSkills("/workspace"), catalog.listPromptTemplates("/workspace")]);
    expect(skills).toEqual([skill]);
    expect(prompts).toEqual([promptTemplate]);
    expect(resourceLoader.reload).toHaveBeenCalledTimes(1);
    await catalog.listSkills("/other-project");
    expect(piSdk.createResourceLoader).toHaveBeenCalledTimes(2);
  });

  it("reloads every project after invalidation", async () => {
    const resourceLoader = {
      getAgentsFiles: () => ({agentsFiles: []}),
      getExtensions: () => ({errors: []}),
      getPrompts: () => ({diagnostics: [], prompts: []}),
      getSkills: () => ({diagnostics: [], skills: [skill]}),
      reload: async () => undefined,
    } as unknown as ResourceLoader;
    const piSdk = {createResourceLoader: vi.fn(() => resourceLoader)} as unknown as LoaderFactory;
    const catalog = await runCatalog(piSdk);

    await Promise.all([catalog.listSkills("/a"), catalog.listSkills("/b")]);
    catalog.invalidate();
    await Promise.all([catalog.listSkills("/a"), catalog.listSkills("/b")]);
    expect(piSdk.createResourceLoader).toHaveBeenCalledTimes(4);
  });
});

type LoaderFactory = {readonly createResourceLoader: (input: {readonly projectPath: string}) => ResourceLoader};

/** A resource cache over a loader factory, loading as `PiSdk.loadResourceLoader` does: construct, then reload. */
function runCatalog(piSdk: LoaderFactory) {
  return createResourceCache({
    loadResourceLoader: async (input) => {
      const loader = piSdk.createResourceLoader(input);
      await loader.reload();
      return loader;
    },
  });
}
