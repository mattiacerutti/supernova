import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CONFIG_DIR_NAME} from "@earendil-works/pi-coding-agent";
import {RUNTIME_HOST} from "@supernova/contracts/lib/protocol";
import {ListComposerSuggestionsResult} from "@supernova/contracts/services/sessions/procedures";
import {SessionsService} from "@supernova/contracts/services/sessions/services";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";
import {createPiSdk} from "@supernova/agent-runtime/pi/sdk";
import {createAgentRuntime} from "@supernova/agent-runtime/runtime";
import {startRuntimeServer} from "@tests/support/runtime-server";

async function writeSkill(root: string, name: string, description: string): Promise<void> {
  await mkdir(join(root, ".agents", "skills", name), {recursive: true});
  await writeFile(join(root, ".agents", "skills", name, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n`);
}

describe("composer suggestions", () => {
  const environment = {...process.env};
  let home: string;
  let project: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "supernova-suggestions-home-"));
    project = join(home, "repo");
    await mkdir(join(project, ".git"), {recursive: true});
    process.env.HOME = home;
    process.env.PI_CODING_AGENT_DIR = join(home, ".supernova", "agent");
    process.env.PI_OFFLINE = "1";
  });

  afterEach(async () => {
    process.env = {...environment};
    await rm(home, {force: true, recursive: true});
  });

  async function connect() {
    const sdk = await createPiSdk();
    let loads = 0;
    let broken: string | undefined;
    // The real SDK; only its loader factory is wrapped, to count loads and to break them.
    const counted: PiSdk = {
      ...sdk,
      loadResourceLoader: async (input) => {
        loads++;
        if (broken) throw new Error(broken);
        return sdk.loadResourceLoader(input);
      },
    };
    const runtime = await createAgentRuntime({sdk: {...counted, updatePackages: async () => undefined}});
    const server = startRuntimeServer(runtime);
    const service = server.client.get(SessionsService, {}, {at: RUNTIME_HOST});
    const extensions = server.client.get(ExtensionsService, {}, {at: RUNTIME_HOST});
    return {
      updateExtensions: async () => expect(await extensions.update(null)).toEqual({ok: true, value: null}),
      close: async () => {
        await server.close();
        await runtime.dispose();
      },
      loads: () => loads,
      breakLoads: (message: string | undefined) => {
        broken = message;
      },
      // Prompt templates are not loaded, so every suggestion is a skill.
      suggestions: async (projectPath = project) => {
        const result = await service.listComposerSuggestions({projectPath});
        if (!result.ok) throw new Error(result.error.message);
        return ListComposerSuggestionsResult.parse(result.value).items.map((item) => {
          if (item.kind !== "skill") throw new Error(`Unexpected ${item.kind} suggestion.`);
          return item;
        });
      },
      service,
    };
  }

  it("offers every skill the project and user have, each once, titled for the menu", async () => {
    await writeSkill(project, "code-review", "Review a diff");
    await writeSkill(home, "release-notes", "Draft release notes");
    const runtime = await connect();
    try {
      const items = await runtime.suggestions();

      expect(items.map(({kind, name, subtitle, title}) => ({kind, name, subtitle, title})).toSorted((left, right) => left.name.localeCompare(right.name))).toEqual([
        {kind: "skill", name: "code-review", subtitle: "Review a diff", title: "Code Review"},
        {kind: "skill", name: "release-notes", subtitle: "Draft release notes", title: "Release Notes"},
      ]);
      // Ids are stable across loads, so a selected reference survives a reload.
      expect(new Set(items.map((item) => item.id)).size).toBe(2);
      expect((await runtime.suggestions()).map((item) => item.id)).toEqual(items.map((item) => item.id));
    } finally {
      await runtime.close();
    }
  });

  it("loads a project once, and again only after extensions update", async () => {
    await writeSkill(project, "first", "First skill");
    const runtime = await connect();
    try {
      await Promise.all([runtime.suggestions(), runtime.suggestions()]);
      expect(runtime.loads()).toBe(1);

      // A skill added on disk is not seen until the cache is dropped, which an extensions update does.
      await writeSkill(project, "second", "Second skill");
      expect((await runtime.suggestions()).map((item) => item.name)).toEqual(["first"]);
      await runtime.updateExtensions();
      expect((await runtime.suggestions()).map((item) => item.name).toSorted()).toEqual(["first", "second"]);
      expect(runtime.loads()).toBe(2);
    } finally {
      await runtime.close();
    }
  });

  it("reports a failed load, and loads again once the project is fixed", async () => {
    await writeSkill(project, "skill", "A skill");
    const runtime = await connect();
    try {
      runtime.breakLoads("Broken resource configuration");
      expect(await runtime.service.listComposerSuggestions({projectPath: project})).toEqual({
        ok: false,
        error: {code: "GenericError", message: "Broken resource configuration"},
      });

      runtime.breakLoads(undefined);
      expect((await runtime.suggestions()).map((item) => item.name)).toEqual(["skill"]);
      expect(runtime.loads()).toBe(2);
    } finally {
      await runtime.close();
    }
  });

  it("reports an extension that fails to load instead of offering a partial list", async () => {
    await writeSkill(project, "skill", "A skill");
    await mkdir(join(project, CONFIG_DIR_NAME, "extensions"), {recursive: true});
    await writeFile(join(project, CONFIG_DIR_NAME, "extensions", "broken.ts"), "export default function() { throw new Error('extension exploded'); }\n");
    const runtime = await connect();
    try {
      const result = await runtime.service.listComposerSuggestions({projectPath: project});
      expect(result).toMatchObject({ok: false, error: {code: "GenericError"}});
      expect(!result.ok && result.error.message).toContain("broken.ts");
    } finally {
      await runtime.close();
    }
  });
});
