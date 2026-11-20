import {mkdtemp, realpath} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, expect, it} from "vitest";
import {spawnPty} from "@supernova/agent-runtime/features/workspace/lib/terminal/pty";
import {cleanupTempDirs, waitUntil} from "@tests/support/async";
import {shellCommand, testShell} from "@tests/support/terminal";

const tempDirs: string[] = [];
afterEach(() => cleanupTempDirs(tempDirs));

// Windows' PTY ignores `encoding: null` and decodes output itself; offsets and the byte channel need bytes everywhere.
it("delivers the shell's output as bytes", async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), "supernova-pty-")));
  tempDirs.push(cwd);
  const chunks: unknown[] = [];
  let exit: () => void = () => undefined;
  const exited = new Promise<void>((resolve) => (exit = resolve));
  const pty = await spawnPty({cols: 80, cwd, env: process.env, onData: (data) => chunks.push(data), onExit: () => exit(), rows: 24, shell: testShell});
  try {
    pty.write(new TextEncoder().encode(shellCommand("echo PTY_$((1+1))", "node -p \"'PTY_' + (1+1)\"")));
    await waitUntil(() => expect(new TextDecoder().decode(Buffer.concat(chunks as Uint8Array[]))).toContain("PTY_2"), {timeoutMs: 5_000});
    expect(chunks.every((chunk) => chunk instanceof Uint8Array)).toBe(true);
  } finally {
    pty.kill("SIGKILL");
    // Windows keeps a running shell's directory from being removed.
    await exited;
  }
});
