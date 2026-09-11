import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {CONFIG_DIR_NAME, SettingsManager} from "@earendil-works/pi-coding-agent";
import {afterEach, describe, expect, it} from "vitest";
import {loadPiRuntimeSettings} from "@supernova/agent-runtime/layers/session-runtime/lib/pi-runtime-settings";

const roots: string[] = [];

async function createSettingsFiles(global?: string, project?: string) {
  const root = await mkdtemp(join(tmpdir(), "supernova-settings-"));
  roots.push(root);
  const cwd = join(root, "project");
  const agentDir = join(root, "agent");
  await mkdir(join(cwd, CONFIG_DIR_NAME), {recursive: true});
  await mkdir(agentDir);
  const globalPath = join(agentDir, "settings.json");
  const projectPath = join(cwd, CONFIG_DIR_NAME, "settings.json");
  if (global !== undefined) await writeFile(globalPath, global);
  if (project !== undefined) await writeFile(projectPath, project);
  return {cwd, agentDir, globalPath, projectPath};
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {recursive: true, force: true})));
});

describe("Pi runtime file settings", () => {
  it("loads supported settings and merges project overrides without exposing unsupported keys", async () => {
    const files = await createSettingsFiles(
      JSON.stringify({
        thinkingBudgets: {minimal: 512, low: 1024, medium: 2048, high: 4096, futureLevel: 8192},
        compaction: {enabled: false, reserveTokens: 1000, keepRecentTokens: 2000, modelOverrides: {"provider/model": {reserveTokens: 9000}}},
        retry: {enabled: false, maxRetries: 5, baseDelayMs: 50, maxAgentDelayMs: 100, provider: {timeoutMs: 3000, maxRetries: 2, maxRetryDelayMs: 4000, futureOption: true}},
        transport: "sse",
        httpIdleTimeoutMs: 12000,
        websocketConnectTimeoutMs: 6000,
        shellPath: "/bin/bash",
        shellCommandPrefix: "export TEST_PREFIX=global",
        images: {autoResize: false, blockImages: true},
        enableInstallTelemetry: false,
        defaultModel: "ignored-model",
        defaultThinkingLevel: "high",
        httpProxy: "http://ignored.invalid",
        packages: ["npm:must-not-install"],
        extensions: ["must-not-load.ts"],
        sessionDir: "ignored-sessions",
        defaultProjectTrust: "never",
        hideThinkingBlock: true,
      }),
      JSON.stringify({compaction: {reserveTokens: 3000}, retry: {maxRetries: 0}, shellCommandPrefix: "export TEST_PREFIX=project", skills: ["ignored-skills"]})
    );

    const settings = loadPiRuntimeSettings(files.cwd, files.agentDir);

    expect(settings.getGlobalSettings()).toEqual({
      thinkingBudgets: {minimal: 512, low: 1024, medium: 2048, high: 4096},
      compaction: {enabled: false, reserveTokens: 3000, keepRecentTokens: 2000},
      retry: {enabled: false, maxRetries: 0, baseDelayMs: 50, provider: {timeoutMs: 3000, maxRetries: 2, maxRetryDelayMs: 4000}},
      transport: "sse",
      httpIdleTimeoutMs: 12000,
      websocketConnectTimeoutMs: 6000,
      shellPath: "/bin/bash",
      shellCommandPrefix: "export TEST_PREFIX=project",
      images: {autoResize: false},
      enableInstallTelemetry: false,
    });
    expect(settings.getDefaultModel()).toBeUndefined();
    expect(settings.getBlockImages()).toBe(false);
    expect(settings.getPackages()).toEqual([]);
  });

  it.each([
    {name: "missing files", global: undefined, project: undefined},
    {name: "empty objects", global: "{}", project: "{}"},
  ])("preserves SDK defaults with $name", async ({global, project}) => {
    const files = await createSettingsFiles(global, project);
    const settings = loadPiRuntimeSettings(files.cwd, files.agentDir);
    const defaults = SettingsManager.inMemory();

    expect(settings.getCompactionSettings()).toEqual(defaults.getCompactionSettings());
    expect(settings.getRetrySettings()).toEqual(defaults.getRetrySettings());
    expect(settings.getProviderRetrySettings()).toEqual(defaults.getProviderRetrySettings());
    expect(settings.getTransport()).toBe(defaults.getTransport());
    expect(settings.getHttpIdleTimeoutMs()).toBe(defaults.getHttpIdleTimeoutMs());
    expect(settings.getWebSocketConnectTimeoutMs()).toBe(defaults.getWebSocketConnectTimeoutMs());
    expect(settings.getImageAutoResize()).toBe(defaults.getImageAutoResize());
    expect(settings.getThinkingBudgets()).toBeUndefined();
  });

  it.each(["global", "project"] as const)("reports malformed %s files without exposing their content", async (scope) => {
    const malformed = '{"secret": "do-not-print-this"';
    const files = await createSettingsFiles(scope === "global" ? malformed : "{}", scope === "project" ? malformed : "{}");
    expect(() => loadPiRuntimeSettings(files.cwd, files.agentDir)).toThrow(`Could not load ${scope} settings.json. Check that the files are readable and contain valid JSON.`);
  });

  it("keeps active settings as a snapshot without writing session changes into the source files", async () => {
    const global = JSON.stringify({transport: "sse", defaultModel: "preserve-me"});
    const project = JSON.stringify({retry: {maxRetries: 1}});
    const files = await createSettingsFiles(global, project);
    const active = loadPiRuntimeSettings(files.cwd, files.agentDir);
    active.setDefaultModel("session-choice");
    await active.flush();

    expect(await readFile(files.globalPath, "utf8")).toBe(global);
    expect(await readFile(files.projectPath, "utf8")).toBe(project);

    await writeFile(files.projectPath, JSON.stringify({retry: {maxRetries: 7}}));
    expect(active.getRetrySettings().maxRetries).toBe(1);
    expect(loadPiRuntimeSettings(files.cwd, files.agentDir).getRetrySettings().maxRetries).toBe(7);
  });
});
