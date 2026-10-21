import {mkdir, mkdtemp, realpath, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {preview} from "vite";
import {startServerProcess} from "@supernova/server/process";
import {ScriptedModel} from "@tests/e2e/harness/model-server";

const REPO = resolve(import.meta.dirname, "../../../../..");

export interface Supernova {
  readonly projectsRoot: string;
  readonly model: ScriptedModel;
  readonly baseURL: string;
  readonly logs: () => string;
  readonly stop: () => Promise<void>;
}

export async function startSupernova(): Promise<Supernova> {
  // Resolved, so paths the server reports match the tests' (macOS links /var to /private/var).
  const home = await realpath(await mkdtemp(join(tmpdir(), "supernova-e2e-")));
  const agentDir = join(home, ".supernova", "userdata", "agent");
  await mkdir(agentDir, {recursive: true});
  const model = await ScriptedModel.start();
  const provider = {baseUrl: model.baseUrl, api: "openai-completions", apiKey: "e2e", models: [{id: "scripted-model", name: "Scripted Model", input: ["text", "image"]}]};
  await writeFile(join(agentDir, "models.json"), JSON.stringify({providers: {scripted: provider}}));

  let output = "";
  const resources: Array<{close: () => Promise<void>}> = [model];
  const stop = async () => {
    for (const resource of resources.reverse()) await resource.close();
    await rm(home, {force: true, recursive: true});
  };

  try {
    const server = await startServerProcess({
      entry: join(REPO, "apps/server/dist/cli.js"),
      execPath: "node",
      // Offline, and without the developer's shell config: the only network the server sees is the model.
      env: {HOME: home, USERPROFILE: home, SUPERNOVA_HOME: join(home, ".supernova"), PI_OFFLINE: "1", SHELL: "/bin/sh"},
      onOutput: (chunk) => (output += chunk),
    });
    resources.push(server);
    const client = await preview({
      configFile: false,
      logLevel: "silent",
      build: {outDir: join(REPO, "packages/web/dist")},
      preview: {host: "127.0.0.1", port: 0, proxy: {"/ws": {target: server.url, ws: true}}},
    });
    resources.push(client);
    return {projectsRoot: home, model, baseURL: client.resolvedUrls!.local[0]!, logs: () => output, stop};
  } catch (error) {
    await stop();
    throw new Error(`Supernova did not start.\n${output}`, {cause: error});
  }
}
