import {test, expect} from "bun:test";
import {spawnSync} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import type {WebSocketLike} from "@earendil-works/chord";
import {createHost, webSocketLink} from "@earendil-works/chord";
import {RUNTIME_HOST} from "@supernova/contracts/lib/protocol";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {startServerProcess} from "@supernova/server/process";

test("Electron's Node mode starts and stops the bundled headless API", async () => {
  const home = await mkdtemp(join(tmpdir(), "supernova-electron-api-"));
  const serverDir = resolve(import.meta.dir, "../../server");
  // As the release build does: node-pty stays external, and the bundle sits where Node resolves it, the server's
  // node_modules (a release copies it next to cli.js instead).
  const entry = join(serverDir, `cli-electron-test-${process.pid}.mjs`);
  try {
    const build = spawnSync("bun", ["build", "src/cli.ts", "--target", "node", "--external", "@lydell/node-pty", "--outfile", entry], {
      cwd: serverDir,
      encoding: "utf8",
    });
    expect(build.status, build.stderr).toBe(0);
    const server = await startServerProcess({
      entry,
      execPath: createRequire(import.meta.url)("electron") as string,
      env: {ELECTRON_RUN_AS_NODE: "1", SUPERNOVA_HOME: home, PI_OFFLINE: "1"},
    });
    try {
      expect((await fetch(`${server.url}/health`)).status).toBe(200);
      expect((await fetch(server.url)).status).toBe(404);
      // A call over Chord's WebSocket link proves the bundled runtime serves its services.
      const socket = new WebSocket(`${server.url.replace("http:", "ws:")}/ws`);
      const closed = new Promise<void>((resolve) => socket.addEventListener("close", () => resolve()));
      const client = createHost({name: "browser", kind: "client", upstream: webSocketLink(socket as unknown as WebSocketLike), onError: () => undefined});
      const configuration = client.get(ConfigurationService, {}, {at: RUNTIME_HOST});
      expect(await configuration.get({})).toMatchObject({ok: true});
      await server.close();
      await closed;
      await client.close();
    } finally {
      await server.close();
    }
    await expect(fetch(`${server.url}/health`)).rejects.toThrow();
  } finally {
    await rm(home, {recursive: true, force: true});
    await rm(entry, {force: true});
  }
}, 30_000);
