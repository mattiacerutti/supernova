import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CONFIG_DIR_NAME} from "@earendil-works/pi-coding-agent";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {Configuration} from "@supernova/agent-runtime/features/configuration/configuration";

let root: string;
let projectPath: string;
let globalFile: string;
let projectFile: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "supernova-configuration-"));
  const agentDir = join(root, "agent");
  projectPath = join(root, "project");
  await mkdir(agentDir);
  await mkdir(join(projectPath, CONFIG_DIR_NAME), {recursive: true});
  globalFile = join(agentDir, "settings.json");
  projectFile = join(projectPath, CONFIG_DIR_NAME, "settings.json");
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await rm(root, {recursive: true, force: true});
});

const settings = new Configuration();

function configuration(path?: string) {
  return settings.get({projectPath: path});
}

describe("client-safe configuration", () => {
  it("returns no configured defaults when settings files are absent", async () => {
    expect(JSON.parse(JSON.stringify(configuration(projectPath)))).toEqual({modelDefaults: {}});
  });

  it("returns only typed client settings, merged per project and without rewriting files", async () => {
    const global = JSON.stringify({
      defaultProvider: "provider",
      defaultModel: "global-model",
      defaultThinkingLevel: "high",
      shellCommandPrefix: "export SECRET=private",
      httpProxy: "http://user:password@proxy.invalid",
      extensions: ["must-not-load.ts"],
      packages: ["npm:must-not-install"],
      supernova: {secret: "private"},
    });
    const project = JSON.stringify({defaultModel: "project-model", defaultThinkingLevel: "off"});
    await writeFile(globalFile, global);
    await writeFile(projectFile, project);

    expect(configuration(projectPath)).toEqual({modelDefaults: {providerId: "provider", modelId: "project-model", thinkingLevel: "off"}});
    expect(configuration()).toEqual({modelDefaults: {providerId: "provider", modelId: "global-model", thinkingLevel: "high"}});
    expect(configuration(join(root, "another-project"))).toEqual({modelDefaults: {providerId: "provider", modelId: "global-model", thinkingLevel: "high"}});
    expect(await readFile(globalFile, "utf8")).toBe(global);
    expect(await readFile(projectFile, "utf8")).toBe(project);
  });

  it("merges per-model reasoning defaults by key without changing the global configuration or files", async () => {
    const global = JSON.stringify({modelThinkingLevels: {"a/model": "high", "b/model": "low"}});
    const project = JSON.stringify({modelThinkingLevels: {"a/model": "off", "c/model": "max"}});
    await writeFile(globalFile, global);
    await writeFile(projectFile, project);

    expect(configuration(projectPath).modelDefaults.modelThinkingLevels).toEqual({"a/model": "off", "b/model": "low", "c/model": "max"});
    expect(configuration().modelDefaults.modelThinkingLevels).toEqual({"a/model": "high", "b/model": "low"});
    expect(await readFile(globalFile, "utf8")).toBe(global);
    expect(await readFile(projectFile, "utf8")).toBe(project);
  });

  it("does not consult the server working directory's project configuration for a global request", async () => {
    await writeFile(globalFile, JSON.stringify({defaultModel: "global-model"}));
    await writeFile(projectFile, "invalid project JSON");
    vi.spyOn(process, "cwd").mockReturnValue(projectPath);

    expect(JSON.parse(JSON.stringify(configuration()))).toEqual({modelDefaults: {modelId: "global-model"}});
  });

  it.each([
    {name: "malformed JSON", content: '{"secret": "private"'},
    {name: "invalid model type", content: JSON.stringify({defaultModel: {secret: "private"}})},
    {name: "invalid provider type", content: JSON.stringify({defaultProvider: 123})},
    {name: "invalid reasoning level", content: JSON.stringify({defaultThinkingLevel: "private"})},
    {name: "invalid per-model reasoning level", content: JSON.stringify({modelThinkingLevels: {"a/model": "private"}})},
    {name: "invalid per-model reasoning value type", content: JSON.stringify({modelThinkingLevels: {"a/model": 123}})},
  ])("fails with a sanitized message for $name", async ({content}) => {
    await writeFile(projectFile, content);
    let error: unknown;
    try {
      configuration(projectPath);
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({message: "Unable to load configuration. Check the global and project settings.json files and model defaults."});
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(error)).not.toContain("private");
  });

  it("reads edits on the next request rather than retaining a process-wide snapshot", async () => {
    await writeFile(globalFile, JSON.stringify({defaultModel: "before"}));
    expect(configuration(projectPath).modelDefaults.modelId).toBe("before");
    await writeFile(globalFile, JSON.stringify({defaultModel: "after"}));
    expect(configuration(projectPath).modelDefaults.modelId).toBe("after");
  });
});
