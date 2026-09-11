import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CONFIG_DIR_NAME, createAgentSession, ModelRuntime, SessionManager, SettingsManager} from "@earendil-works/pi-coding-agent";
import {InMemoryCredentialStore} from "@earendil-works/pi-ai";
import {Effect} from "effect";
import {afterEach, describe, expect, it, vi} from "vitest";
import {PiSdkLive, PiSdkService} from "@supernova/agent-runtime/layers/pi-sdk";
import {CustomPiResourceLoader} from "@supernova/agent-runtime/layers/pi-config";
import {cleanupTempDirs} from "@tests/support/layers/test-utils";

async function writeSkill(path: string, name: string): Promise<void> {
  await mkdir(path, {recursive: true});
  await writeFile(join(path, "SKILL.md"), `---\nname: ${name}\ndescription: Test skill.\n---\n# ${name}\n`);
}

async function createTestProject(): Promise<{agentDir: string; home: string; project: string; repo: string}> {
  const home = await mkdtemp(join(tmpdir(), "supernova-home-"));
  const repo = join(home, "workspace", "repo");
  const project = join(repo, "packages", "app");
  const agentDir = join(home, ".supernova", "userdata", "agent");

  process.env.HOME = home;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  await mkdir(join(repo, ".git"), {recursive: true});
  await mkdir(project, {recursive: true});

  return {agentDir, home, project, repo};
}

describe("Supernova Pi SDK config", () => {
  const originalHome = process.env.HOME;
  const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
  const originalPiOffline = process.env.PI_OFFLINE;
  const tempDirs: string[] = [];

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    if (originalPiCodingAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
    }
    if (originalPiOffline === undefined) {
      delete process.env.PI_OFFLINE;
    } else {
      process.env.PI_OFFLINE = originalPiOffline;
    }
    cleanupTempDirs(tempDirs);
  });

  it("wires PiSdkLive to the custom resource loader", async () => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const {project} = testProject;

    await writeSkill(join(project, ".agents", "skills", "project-skill"), "project-skill");
    await writeSkill(join(project, CONFIG_DIR_NAME, "skills", "pi-skill"), "pi-skill");

    const piSdk = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* PiSdkService;
      }).pipe(Effect.provide(PiSdkLive))
    );
    const loader = piSdk.createResourceLoader({projectPath: project});
    await loader.reload();

    expect(loader).toBeInstanceOf(CustomPiResourceLoader);
    expect(
      loader
        .getSkills()
        .skills.map((skill) => skill.name)
        .sort()
    ).toEqual(["pi-skill", "project-skill"]);
  });

  it("loads standard global/project skills and .agents skills up to the repository root", async () => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const {agentDir, home, project, repo} = testProject;

    await writeSkill(join(home, ".agents", "skills", "global-skill"), "global-skill");
    await writeSkill(join(repo, ".agents", "skills", "repo-skill"), "repo-skill");
    await writeSkill(join(project, ".agents", "skills", "project-skill"), "project-skill");
    await writeSkill(join(repo, "..", ".agents", "skills", "above-repo-skill"), "above-repo-skill");
    await writeSkill(join(project, CONFIG_DIR_NAME, "skills", "pi-skill"), "pi-skill");
    await writeSkill(join(agentDir, "skills", "agent-skill"), "agent-skill");
    await writeFile(join(agentDir, "skills", "root.md"), "---\nname: root-skill\ndescription: Root Markdown skill\n---\nSkill body");

    const loader = new CustomPiResourceLoader(project);
    await loader.reload();

    expect(
      loader
        .getSkills()
        .skills.map((skill) => skill.name)
        .sort()
    ).toEqual(["agent-skill", "global-skill", "pi-skill", "project-skill", "repo-skill", "root-skill"]);
  });

  it.each(["global", "project"] as const)("loads %s configured extension paths, skill paths, and package resources", async (scope) => {
    const {agentDir, home, project, repo} = await createTestProject();
    tempDirs.push(home, repo);
    const settingsDir = scope === "global" ? agentDir : join(project, CONFIG_DIR_NAME);
    const packageDir = join(settingsDir, "kit");
    await writeSkill(join(packageDir, "skills", "package-skill"), "package-skill");
    await mkdir(join(packageDir, "extensions"), {recursive: true});
    await mkdir(join(packageDir, "prompts"));
    await mkdir(join(packageDir, "themes"));
    await writeFile(
      join(packageDir, "package.json"),
      JSON.stringify({name: "fixture-kit", pi: {extensions: ["extensions"], skills: ["skills"], prompts: ["prompts"], themes: ["themes"]}})
    );
    await writeFile(
      join(packageDir, "extensions", "tool.ts"),
      `
import {Type} from "typebox";
export default function(pi) {
  pi.registerTool({name: "package_tool", label: "Package tool", description: "Test tool", parameters: Type.Object({}), execute: async () => ({content: [{type: "text", text: "ok"}], details: {}})});
}`
    );
    await writeFile(join(packageDir, "prompts", "ignored.md"), "---\ndescription: Ignored\n---\nIgnored prompt");
    await writeFile(join(packageDir, "themes", "ignored.json"), "{}");
    await writeFile(join(settingsDir, "extra.ts"), "export default function() {}");
    await writeFile(join(settingsDir, "explicit.md"), "---\nname: explicit-skill\ndescription: Explicit file\ndisable-model-invocation: true\n---\nSkill body");
    await writeSkill(join(home, "shared-skills", "shared-skill"), "shared-skill");
    await writeFile(join(settingsDir, "settings.json"), JSON.stringify({extensions: ["./extra.ts"], skills: ["./explicit.md", "~/shared-skills"], packages: ["./kit"]}));

    const loader = new CustomPiResourceLoader(project);
    await loader.reload();
    expect(loader.getExtensions().errors).toEqual([]);
    expect(
      loader
        .getExtensions()
        .extensions.map((extension) => extension.path)
        .sort()
    ).toEqual([join(settingsDir, "extra.ts"), join(packageDir, "extensions", "tool.ts")].sort());
    expect(loader.getExtensions().extensions.some((extension) => extension.tools.has("package_tool"))).toBe(true);
    expect(
      loader
        .getSkills()
        .skills.map((skill) => skill.name)
        .sort()
    ).toEqual(["explicit-skill", "package-skill", "shared-skill"]);
    expect(loader.getSkills().skills.find((skill) => skill.name === "explicit-skill")?.disableModelInvocation).toBe(true);
    expect(loader.getPrompts().prompts).toEqual([]);
    expect(loader.getThemes().themes).toEqual([]);

    // A new loader picks up Pi's per-package resource filters after a restart.
    await writeFile(join(settingsDir, "settings.json"), JSON.stringify({packages: [{source: "./kit", extensions: [], skills: []}]}));
    const filtered = new CustomPiResourceLoader(project);
    await filtered.reload();
    expect(filtered.getExtensions().extensions).toEqual([]);
    expect(filtered.getSkills().skills).toEqual([]);
  });

  it("rejects malformed resource settings", async () => {
    const {agentDir, home, project, repo} = await createTestProject();
    tempDirs.push(home, repo);
    await mkdir(agentDir, {recursive: true});
    await writeFile(join(agentDir, "settings.json"), "{broken");
    expect(() => new CustomPiResourceLoader(project)).toThrow("settings.json");
  });

  it.each([
    {name: "present", content: "shared user instructions"},
    {name: "empty", content: ""},
    {name: "missing", content: undefined},
  ])("loads $name shared instructions alongside existing context files", async ({content}) => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const {agentDir, home, project, repo} = testProject;
    const path = join(home, ".agents", "AGENTS.md");

    if (content !== undefined) {
      await mkdir(join(home, ".agents"), {recursive: true});
      await writeFile(path, content);
    }
    await mkdir(agentDir, {recursive: true});
    await writeFile(join(agentDir, "AGENTS.md"), "Supernova instructions");
    await writeFile(join(repo, "AGENTS.md"), "repo instructions");
    await writeFile(join(project, "AGENTS.md"), "project instructions");

    const loader = new CustomPiResourceLoader(project);
    await loader.reload();

    expect(loader.getAgentsFiles().agentsFiles).toEqual([
      ...(content === undefined ? [] : [{path, content}]),
      {path: join(agentDir, "AGENTS.md"), content: "Supernova instructions"},
      {path: join(repo, "AGENTS.md"), content: "repo instructions"},
      {path: join(project, "AGENTS.md"), content: "project instructions"},
    ]);
  });

  it("refreshes shared instructions on reload without retaining deleted files", async () => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const {home, project} = testProject;
    const path = join(home, ".agents", "AGENTS.md");
    const loader = new CustomPiResourceLoader(project);
    await loader.reload();
    await mkdir(join(home, ".agents"), {recursive: true});

    for (const content of ["initial instructions", "updated instructions"]) {
      await writeFile(path, content);
      await loader.reload();
      expect(loader.getAgentsFiles().agentsFiles).toEqual([{path, content}]);
    }

    await rm(path);
    await loader.reload();
    expect(loader.getAgentsFiles().agentsFiles).toEqual([]);
  });

  it("does not duplicate shared instructions already discovered by Pi", async () => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const project = join(testProject.home, ".agents");
    const path = join(project, "AGENTS.md");
    await mkdir(project, {recursive: true});
    await writeFile(path, "shared user instructions");

    const loader = new CustomPiResourceLoader(project);
    await loader.reload();

    expect(loader.getAgentsFiles().agentsFiles).toEqual([{path, content: "shared user instructions"}]);
  });

  it("warns and preserves project instructions when shared instructions cannot be read", async () => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const {home, project} = testProject;
    const path = join(home, ".agents", "AGENTS.md");
    await mkdir(path, {recursive: true});
    await writeFile(join(project, "AGENTS.md"), "project instructions");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const loader = new CustomPiResourceLoader(project);
      await loader.reload();

      expect(loader.getAgentsFiles().agentsFiles).toEqual([{path: join(project, "AGENTS.md"), content: "project instructions"}]);
      expect(warning).toHaveBeenCalledWith(expect.stringContaining(`Could not read ${path}`));
    } finally {
      warning.mockRestore();
    }
  });

  it("creates Pi credential storage from the runtime agent directory when the layer starts", async () => {
    const home = await mkdtemp(join(tmpdir(), "supernova-home-"));
    const agentDir = join(home, ".supernova", "dev", "agent");
    tempDirs.push(home);
    process.env.HOME = home;
    process.env.PI_CODING_AGENT_DIR = agentDir;
    process.env.PI_OFFLINE = "1";

    const piSdk = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* PiSdkService;
      }).pipe(Effect.provide(PiSdkLive))
    );

    await piSdk.modelRuntime.login("openai", "api_key", {
      notify: () => undefined,
      prompt: async () => "test-key",
    });

    const authJson = JSON.parse(await readFile(join(agentDir, "auth.json"), "utf-8")) as Record<string, {type: string; key?: string}>;
    expect(authJson.openai).toEqual({type: "api_key", key: "test-key"});
  });

  it("loads extensions while leaving themes and prompt templates disabled", async () => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const {project} = testProject;

    await mkdir(join(project, CONFIG_DIR_NAME, "prompts"), {recursive: true});
    await mkdir(join(project, CONFIG_DIR_NAME, "themes"), {recursive: true});
    await mkdir(join(project, CONFIG_DIR_NAME, "extensions"), {recursive: true});
    await writeFile(join(project, CONFIG_DIR_NAME, "prompts", "ignored.md"), "---\ndescription: ignored\n---\nignored");
    await writeFile(join(project, CONFIG_DIR_NAME, "themes", "ignored.json"), "{}");
    await writeFile(join(project, CONFIG_DIR_NAME, "extensions", "extension.ts"), "export default function() {}\n");

    const loader = new CustomPiResourceLoader(project);
    await loader.reload();

    expect(loader.getPrompts().prompts).toEqual([]);
    expect(loader.getThemes().themes).toEqual([]);
    expect(loader.getExtensions().extensions).toHaveLength(1);
  });

  it("does not load system prompts from files while keeping Pi's default system prompt", async () => {
    const testProject = await createTestProject();
    tempDirs.push(testProject.home, testProject.repo);
    const {agentDir, home, project} = testProject;

    await mkdir(join(home, ".agents"), {recursive: true});
    await writeFile(join(home, ".agents", "AGENTS.md"), "shared user instructions");
    await mkdir(join(project, ".pi"), {recursive: true});
    await writeFile(join(project, ".pi", "SYSTEM.md"), "ignored system prompt");
    await mkdir(agentDir, {recursive: true});
    await writeFile(join(agentDir, "SYSTEM.md"), "ignored global system prompt");
    await writeFile(join(project, ".pi", "APPEND_SYSTEM.md"), "ignored appended system prompt");
    await writeFile(join(project, "AGENTS.md"), "project instructions");

    const loader = new CustomPiResourceLoader(project);
    await loader.reload();

    expect(loader.getSystemPrompt()).toBeUndefined();
    expect(loader.getAppendSystemPrompt()).toEqual([]);
    expect(loader.getAgentsFiles().agentsFiles).toEqual([
      {content: "shared user instructions", path: join(home, ".agents", "AGENTS.md")},
      {content: "project instructions", path: join(project, "AGENTS.md")},
    ]);

    const modelRuntime = await ModelRuntime.create({credentials: new InMemoryCredentialStore(), modelsPath: null});
    const {session} = await createAgentSession({
      cwd: project,
      modelRuntime,
      noTools: "all",
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(project),
      settingsManager: SettingsManager.inMemory(),
    });

    try {
      expect(session.systemPrompt).toContain("operating inside pi");
      expect(session.systemPrompt).toContain("shared user instructions");
      expect(session.systemPrompt).toContain("project instructions");
      expect(session.systemPrompt).not.toContain("ignored system prompt");
      expect(session.systemPrompt).not.toContain("ignored global system prompt");
      expect(session.systemPrompt).not.toContain("ignored appended system prompt");
    } finally {
      session.dispose();
    }
  });
});
