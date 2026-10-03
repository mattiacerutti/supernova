import {test, expect} from "bun:test";
import {fork} from "node:child_process";
import {once} from "node:events";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {resolve, join} from "node:path";
import {startServerProcess} from "@/process";

const entry = resolve(import.meta.dir, "../src/cli.ts");
// The server runs on Node; `bun test` is only the test runner. The source runs as `dev` runs it, through tsx.
const runtime = {execPath: "node", execArgv: ["--import", "tsx"]};

// Each child starts Node and tsx before it parses its arguments, which takes seconds under a loaded full-suite run.
test.each(["", "abc", "1.5", "-1", "65536"])(
  "rejects invalid port %j before startup",
  async (port) => {
    const home = await mkdtemp(join(tmpdir(), "supernova-invalid-port-"));
    const child = fork(entry, ["--port", port], {
      ...runtime,
      silent: true,
      env: {...process.env, SUPERNOVA_HOME: home, PI_OFFLINE: "1"},
    });
    try {
      const [code] = await once(child, "exit");
      expect(code).toBe(1);
    } finally {
      child.kill("SIGKILL");
      await rm(home, {recursive: true, force: true});
    }
  },
  30_000
);

test("owned APIs bind distinct ports, report RPC readiness, serve no UI, and release live sockets on close", async () => {
  const home = await mkdtemp(join(tmpdir(), "supernova-server-test-"));
  const options = {entry, ...runtime, env: {SUPERNOVA_HOME: home, PI_OFFLINE: "1"}};
  const first = await startServerProcess(options);
  let second: Awaited<ReturnType<typeof startServerProcess>> | undefined;
  try {
    second = await startServerProcess(options);
    expect(first.url).not.toBe(second.url);
    expect(await (await fetch(`${first.url}/health`)).json()).toEqual({ok: true});
    expect((await fetch(first.url)).status).toBe(404);
    expect((await fetch(`${first.url}/assets/missing.js`)).status).toBe(404);
    // The runtime protocol answers on /ws: a frame that is not its hello is rejected and the socket closes.
    const probe = new WebSocket(first.url.replace("http:", "ws:") + "/ws");
    probe.binaryType = "arraybuffer";
    await new Promise<void>((resolve, reject) => {
      probe.onopen = () => resolve();
      probe.onerror = reject;
    });
    const probeClosed = new Promise<void>((resolve) => {
      probe.onclose = () => resolve();
    });
    probe.send(new Uint8Array([0, 0, 0, 1, 0]));
    await probeClosed;
    const socket = new WebSocket(first.url.replace("http:", "ws:") + "/ws");
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = reject;
    });
    const closed = new Promise<void>((resolve) => {
      socket.onclose = () => resolve();
    });
    await Promise.all([first.close(), first.close(), closed]);
    expect((await fetch(`${second.url}/health`)).status).toBe(200);
  } finally {
    await Promise.all([first.close(), second?.close()]);
    await rm(home, {recursive: true, force: true});
  }
}, 30_000);

test("a local API exits when its parent's IPC channel disappears", async () => {
  const home = await mkdtemp(join(tmpdir(), "supernova-parent-test-"));
  const child = fork(entry, ["--host", "127.0.0.1", "--port", "0"], {
    ...runtime,
    silent: true,
    env: {...process.env, SUPERNOVA_HOME: home, PI_OFFLINE: "1"},
  });
  try {
    const [ready] = await once(child, "message");
    const socket = new WebSocket(`${ready.url.replace("http:", "ws:")}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = reject;
    });
    const closed = new Promise<void>((resolve) => {
      socket.onclose = () => resolve();
    });
    const exited = once(child, "exit");
    child.disconnect();
    const [code] = await exited;
    expect(code).toBe(0);
    await closed;
  } finally {
    child.kill("SIGKILL");
    await rm(home, {recursive: true, force: true});
  }
}, 30_000);

test("an occupied explicit port fails without disturbing its owner", async () => {
  const home = await mkdtemp(join(tmpdir(), "supernova-port-test-"));
  const env = {...process.env, SUPERNOVA_HOME: home, PI_OFFLINE: "1"};
  const owner = await startServerProcess({entry, ...runtime, env});
  try {
    const child = fork(entry, ["--host", "127.0.0.1", "--port", new URL(owner.url).port], {...runtime, env, silent: true});
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    const [code] = await once(child, "exit");
    expect(code).toBe(1);
    expect(stderr).toContain("already in use");
    expect(stderr).toContain("--port 0");
    expect((await fetch(`${owner.url}/health`)).status).toBe(200);
  } finally {
    await owner.close();
    await rm(home, {recursive: true, force: true});
  }
}, 30_000);
