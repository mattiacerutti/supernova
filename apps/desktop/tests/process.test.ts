import {test, expect} from "bun:test";
import {spawnSync} from "node:child_process";
import {mkdtemp, rm} from "node:fs/promises";
import {createRequire} from "node:module";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {startServerProcess} from "@supernova/server/process";

test("Electron's Node mode starts and stops the bundled headless API", async () => {
  const home = await mkdtemp(join(tmpdir(), "supernova-electron-api-"));
  const entry = join(home, "cli.mjs");
  try {
    const build = spawnSync("bun", ["build", "src/cli.ts", "--target", "node", "--outfile", entry], {
      cwd: resolve(import.meta.dir, "../../server"),
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
      const socket = new WebSocket(`${server.url.replace("http:", "ws:")}/ws`);
      const pong = new Promise<unknown>((resolve, reject) => {
        socket.onopen = () => socket.send(JSON.stringify({_tag: "Ping"}));
        socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
        socket.onerror = reject;
      });
      expect(await pong).toEqual({_tag: "Pong"});
      const closed = new Promise<void>((resolve) => {
        socket.onclose = () => resolve();
      });
      await server.close();
      await closed;
    } finally {
      await server.close();
    }
    await expect(fetch(`${server.url}/health`)).rejects.toThrow();
  } finally {
    await rm(home, {recursive: true, force: true});
  }
}, 30_000);
