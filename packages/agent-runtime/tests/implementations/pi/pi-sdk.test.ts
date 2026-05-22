import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {AuthStorage, createAgentSession, getAgentDir, ModelRegistry, SessionManager, SettingsManager} from "@earendil-works/pi-coding-agent";
import {Effect} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {PiSdkLive, PiSdkService} from "@supernova/agent-runtime/implementations/pi/pi-sdk";
import {configurePiAgentDir, CustomPiResourceLoader, getPiAgentDir} from "@supernova/agent-runtime/implementations/pi/pi-config";

async function writeSkill(path: string, name: string): Promise<void> {
  await mkdir(path, {recursive: true});
  await writeFile(join(path, "SKILL.md"), `---\nname: ${name}\ndescription: Test skill.\n---\n# ${name}\n`);
}

async function createTestProject(): Promise<{agentDir: string; home: string; project: string; repo: string}> {
  const home = await mkdtemp(join(tmpdir(), "supernova-home-"));
  const repo = await mkdtemp(join(tmpdir(), "supernova-repo-"));
  const project = join(repo, "packages", "app");
  const agentDir = join(home, ".supernova", "agent");

  process.env.HOME = home;
  await mkdir(join(repo, ".git"), {recursive: true});
  await mkdir(project, {recursive: true});

  return {agentDir, home, project, repo};
}

describe("Supernova Pi SDK config", () => {
  const originalHome = process.env.HOME;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.HOME;
      return;
    }
    process.env.HOME = originalHome;
  });

  it("uses .supernova as Pi's agent directory", async () => {
    const home = await mkdtemp(join(tmpdir(), "supernova-home-"));
    process.env.HOME = home;

    expect(getPiAgentDir()).toBe(join(home, ".supernova", "agent"));
  });

  it("configures Pi's default getAgentDir to use Supernova's agent directory", async () => {
    const home = await mkdtemp(join(tmpdir(), "supernova-home-"));
    process.env.HOME = home;

    const agentDir = configurePiAgentDir();

    expect(agentDir).toBe(join(home, ".supernova", "agent"));
    expect(getAgentDir()).toBe(agentDir);
  });

  it("wires PiSdkLive to the custom resource loader", async () => {
    const {project} = await createTestProject();

    await writeSkill(join(project, ".agents", "skills", "project-skill"), "project-skill");
    await writeSkill(join(project, ".pi", "skills", "pi-skill"), "pi-skill");

    const piSdk = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* PiSdkService;
      }).pipe(Effect.provide(PiSdkLive))
    );
    const loader = piSdk.createResourceLoader({projectPath: project});
    await loader.reload();

    expect(loader).toBeInstanceOf(CustomPiResourceLoader);
    expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual(["project-skill"]);
  });

  it("loads Pi-discovered .agents skills without loading .pi skills", async () => {
    const {agentDir, home, project, repo} = await createTestProject();

    await writeSkill(join(home, ".agents", "skills", "global-skill"), "global-skill");
    await writeSkill(join(repo, ".agents", "skills", "repo-skill"), "repo-skill");
    await writeSkill(join(project, ".agents", "skills", "project-skill"), "project-skill");
    await writeSkill(join(repo, "..", ".agents", "skills", "above-repo-skill"), "above-repo-skill");
    await writeSkill(join(project, ".pi", "skills", "pi-skill"), "pi-skill");

    const loader = new CustomPiResourceLoader({agentDir, projectPath: project});
    await loader.reload();

    expect(loader.getSkills().skills.map((skill) => skill.name)).toEqual(["project-skill", "repo-skill", "global-skill"]);
  });

  it("does not load Pi extensions, themes, or prompt templates", async () => {
    const {agentDir, project} = await createTestProject();

    await mkdir(join(project, ".pi", "prompts"), {recursive: true});
    await mkdir(join(project, ".pi", "themes"), {recursive: true});
    await mkdir(join(project, ".pi", "extensions"), {recursive: true});
    await writeFile(join(project, ".pi", "prompts", "ignored.md"), "---\ndescription: ignored\n---\nignored");
    await writeFile(join(project, ".pi", "themes", "ignored.json"), "{}");
    await writeFile(join(project, ".pi", "extensions", "ignored.ts"), "export default function() {}\n");

    const loader = new CustomPiResourceLoader({agentDir, projectPath: project});
    await loader.reload();

    expect(loader.getPrompts().prompts).toEqual([]);
    expect(loader.getThemes().themes).toEqual([]);
    expect(loader.getExtensions().extensions).toEqual([]);
  });

  it("does not load system prompts from files while keeping Pi's default system prompt", async () => {
    const {agentDir, project} = await createTestProject();

    await mkdir(join(project, ".pi"), {recursive: true});
    await writeFile(join(project, ".pi", "SYSTEM.md"), "ignored system prompt");
    await mkdir(agentDir, {recursive: true});
    await writeFile(join(agentDir, "SYSTEM.md"), "ignored global system prompt");
    await writeFile(join(project, ".pi", "APPEND_SYSTEM.md"), "ignored appended system prompt");
    await writeFile(join(project, "AGENTS.md"), "project instructions");

    const loader = new CustomPiResourceLoader({agentDir, projectPath: project});
    await loader.reload();

    expect(loader.getSystemPrompt()).toBeUndefined();
    expect(loader.getAppendSystemPrompt()).toEqual([]);
    expect(loader.getAgentsFiles().agentsFiles).toMatchObject([{content: "project instructions", path: join(project, "AGENTS.md")}]);

    const authStorage = AuthStorage.inMemory();
    const {session} = await createAgentSession({
      authStorage,
      cwd: project,
      modelRegistry: ModelRegistry.inMemory(authStorage),
      noTools: "all",
      resourceLoader: loader,
      sessionManager: SessionManager.inMemory(project),
      settingsManager: SettingsManager.inMemory(),
    });

    try {
      expect(session.systemPrompt).toContain("operating inside pi");
      expect(session.systemPrompt).not.toContain("ignored system prompt");
      expect(session.systemPrompt).not.toContain("ignored global system prompt");
      expect(session.systemPrompt).not.toContain("ignored appended system prompt");
    } finally {
      session.dispose();
    }
  });
});
