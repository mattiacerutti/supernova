import {expect, test} from "bun:test";
import type {SpawnSyncReturns} from "node:child_process";
import {existsSync} from "node:fs";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {syncShellEnvironment} from "@/shell";

/** Simulates a shell's framed output, including unrelated startup and logout messages. */
function shellResult(args: string[], environment: unknown): SpawnSyncReturns<string> {
  const marker = args.at(-1)?.match(/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}/)?.[0];
  if (!marker) throw new Error("Missing environment marker in shell command.");

  const stdout = `startup banner\n${marker}${JSON.stringify(environment)}${marker}\nlogout message`;
  return {pid: 1, status: 0, signal: null, stdout, stderr: "", output: [null, stdout, ""]};
}

test.each([{}, {ELECTRON_RUN_AS_NODE: "", ELECTRON_NO_ATTACH_CONSOLE: "0"}, {ELECTRON_RUN_AS_NODE: "1", ELECTRON_NO_ATTACH_CONSOLE: "1"}])(
  "imports the full environment while preserving Electron flags %j",
  (flags) => {
    const env: NodeJS.ProcessEnv = {SHELL: "/bin/zsh", PATH: "/inherited", XDG_RUNTIME_DIR: "/gui", ...flags};
    const warnings: string[] = [];
    const custom = "spaces, 'quotes', \\\\ and\nnewlines";

    syncShellEnvironment({
      env,
      platform: "darwin",
      warn: (message) => warnings.push(message),
      spawn: (_shell, args, options) => {
        expect(options.env).toMatchObject({ELECTRON_RUN_AS_NODE: "1", ELECTRON_NO_ATTACH_CONSOLE: "1"});
        return shellResult(args, {
          PATH: "/shell/bin",
          CUSTOM_VALUE: custom,
          SSH_AUTH_SOCK: "/shell/ssh.sock",
          ELECTRON_RUN_AS_NODE: "changed",
          ELECTRON_NO_ATTACH_CONSOLE: "changed",
          XDG_RUNTIME_DIR: "/shell/runtime",
        });
      },
    });

    expect(env).toEqual({...flags, SHELL: "/bin/zsh", PATH: "/shell/bin", CUSTOM_VALUE: custom, SSH_AUTH_SOCK: "/shell/ssh.sock", XDG_RUNTIME_DIR: "/gui"});
    expect(warnings).toEqual([]);
  }
);

test("does not introduce a shell's runtime directory into a GUI session without one", () => {
  const env: NodeJS.ProcessEnv = {SHELL: "/bin/zsh"};
  syncShellEnvironment({env, platform: "linux", spawn: (_shell, args) => shellResult(args, {XDG_RUNTIME_DIR: "/shell/runtime"})});
  expect(env).toEqual({SHELL: "/bin/zsh"});
});

test.each([
  ["/bin/bash", ["-i", "-l", "-c"], ["-l", "-c"], undefined],
  ["/bin/zsh", ["-i", "-l", "-c"], ["-l", "-c"], undefined],
  ["/usr/bin/fish", ["-i", "-l", "-c"], ["-l", "-c"], undefined],
  ["/usr/bin/nu", ["-i", "-l", "-c"], ["-l", "-c"], undefined],
  ["/usr/bin/xonsh", ["-i", "-l", "-c"], ["-l", "-c"], undefined],
  ["/bin/csh", ["-ic"], ["-c"], "-csh"],
  ["/bin/tcsh", ["-ic"], ["-c"], "-tcsh"],
] as const)("retries %s without applying output from a failed interactive attempt", (shell, interactive, nonInteractive, argv0) => {
  const env = {SHELL: shell, PATH: "/inherited", SUPERNOVA_SHELL_ENV_TIMEOUT_MS: "2000"};
  const warnings: string[] = [];
  let calls = 0;

  syncShellEnvironment({
    env,
    platform: "linux",
    warn: (message) => warnings.push(message),
    spawn: (_shell, args, options) => {
      calls++;
      expect(args.slice(0, -1)).toEqual([...(calls === 1 ? interactive : nonInteractive)]);
      expect(options.argv0).toBe(calls === 1 ? undefined : argv0);
      expect(options.killSignal).toBe("SIGKILL");
      expect(options.timeout).toBeGreaterThan(0);
      expect(options.timeout).toBeLessThanOrEqual(calls === 1 ? 1000 : 2000);
      expect(env.PATH).toBe("/inherited");

      const result = shellResult(args, {PATH: calls === 1 ? "/discarded" : "/profile/bin"});
      return calls === 1 ? {...result, error: Object.assign(new Error("sensitive shell output"), {code: "ETIMEDOUT"}), status: null, signal: "SIGKILL"} : result;
    },
  });

  expect(calls).toBe(2);
  expect(env.PATH).toBe("/profile/bin");
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain("ETIMEDOUT");
  expect(warnings[0]).not.toContain("sensitive");
});

test.each(["pwsh", "powershell", "pwsh-preview", "powershell-preview"])("uses a non-interactive login command for %s", (shell) => {
  const env = {SHELL: `/usr/bin/${shell}`, PATH: "/inherited"};
  let calls = 0;
  syncShellEnvironment({
    env,
    platform: "linux",
    spawn: (_shell, args) => {
      calls++;
      expect(args.slice(0, -1)).toEqual(["-Login", "-Command"]);
      expect(args.at(-1)).toStartWith("& '");
      return shellResult(args, {PATH: "/shell/bin"});
    },
  });
  expect(calls).toBe(1);
  expect(env.PATH).toBe("/shell/bin");
});

test.each([null, [], "sensitive", {CUSTOM: 123}, {"BAD=KEY": "sensitive"}, {CUSTOM: "sensitive\0value"}].map((payload) => ({payload})))(
  "rejects invalid environment payload %j without partial updates",
  ({payload}) => {
    const env = {SHELL: "/bin/zsh", PATH: "/inherited"};
    const warnings: string[] = [];
    syncShellEnvironment({env, platform: "darwin", warn: (message) => warnings.push(message), spawn: (_shell, args) => shellResult(args, payload)});
    expect(env).toEqual({SHELL: "/bin/zsh", PATH: "/inherited"});
    expect(warnings).toHaveLength(2);
    expect(warnings.join("\n")).not.toContain("sensitive");
  }
);

test.each(["missing markers", "missing closing marker", "invalid JSON", "nonzero exit", "signal", "spawn error"])("preserves the environment on %s", (failure) => {
  const env = {SHELL: "/bin/zsh", PATH: "/inherited"};
  const warnings: string[] = [];
  syncShellEnvironment({
    env,
    platform: "darwin",
    warn: (message) => warnings.push(message),
    spawn: (_shell, args) => {
      const result = shellResult(args, {PATH: "/discarded", SECRET: "sensitive"});
      if (failure === "missing markers") result.stdout = "sensitive";
      if (failure === "missing closing marker") result.stdout = result.stdout.slice(0, result.stdout.lastIndexOf("}"));
      if (failure === "invalid JSON") result.stdout = result.stdout.replace("{", "{sensitive");
      if (failure === "nonzero exit") result.status = 42;
      if (failure === "signal") result.signal = "SIGTERM";
      if (failure === "spawn error") result.error = Object.assign(new Error("sensitive"), {code: "ENOENT"});
      return result;
    },
  });
  expect(env).toEqual({SHELL: "/bin/zsh", PATH: "/inherited"});
  expect(warnings).toHaveLength(2);
  expect(warnings.join("\n")).not.toContain("sensitive");
});

test.each([
  ["darwin", "/usr/local/bin/fish", "/usr/local/bin/fish"],
  ["darwin", null, "/bin/zsh"],
  ["linux", "/bin/false", "/bin/bash"],
  ["linux", null, "/bin/bash"],
] as const)("resolves a missing SHELL on %s using account shell %j", (platform, userShell, expected) => {
  const env: NodeJS.ProcessEnv = {};
  syncShellEnvironment({
    env,
    platform,
    getUserShell: () => userShell,
    spawn: (shell, args) => {
      expect(shell).toBe(expected);
      return shellResult(args, {CUSTOM: "imported"});
    },
  });
  expect(env.CUSTOM).toBe("imported");
});

test("falls back when OS account lookup fails", () => {
  const env: NodeJS.ProcessEnv = {};
  syncShellEnvironment({
    env,
    platform: "darwin",
    getUserShell: () => {
      throw new Error("Account unavailable");
    },
    spawn: (shell, args) => {
      expect(shell).toBe("/bin/zsh");
      return shellResult(args, {CUSTOM: "imported"});
    },
  });
  expect(env.CUSTOM).toBe("imported");
});

test.each([undefined, "", "invalid", "0", "-1", "1.5", "2147483648", "Infinity", "1234"])("validates timeout %j", (value) => {
  const env = {SHELL: "/bin/zsh", SUPERNOVA_SHELL_ENV_TIMEOUT_MS: value};
  let budget: number | undefined;
  syncShellEnvironment({
    env,
    platform: "darwin",
    spawn: (_shell, args, options) => {
      budget = options.timeout;
      return shellResult(args, {});
    },
  });
  expect(budget).toBe(value === "1234" ? 617 : 15_000);
});

test("skips shell lookup on Windows", () => {
  const env = {PATH: "C:\\tools"};
  let lookups = 0;
  let spawns = 0;
  syncShellEnvironment({
    env,
    platform: "win32",
    getUserShell: () => {
      lookups++;
      return "/bin/zsh";
    },
    spawn: (_shell, args) => {
      spawns++;
      return shellResult(args, env);
    },
  });
  expect(lookups).toBe(0);
  expect(spawns).toBe(0);
  expect(env).toEqual({PATH: "C:\\tools"});
});

// Actual startup files exercise quoting, banners, retries, and termination without touching the user's shell configuration.
const shellTest = existsSync("/bin/zsh") ? test : test.skip;
shellTest.each(["interactive", "retry", "timeout", "failure"])("reads a real isolated zsh environment: %s", async (mode) => {
  const home = await mkdtemp(join(tmpdir(), "supernova-shell-"));
  const env: NodeJS.ProcessEnv = {HOME: home, ZDOTDIR: home, SHELL: "/bin/zsh", PATH: "/usr/bin:/bin", TERM: "dumb", SUPERNOVA_SHELL_ENV_TIMEOUT_MS: "2000"};
  const inherited = {...env};
  const warnings: string[] = [];

  try {
    await writeFile(join(home, ".zprofile"), 'export PATH="$HOME/tools:$PATH"\nexport SHELL_TEST_PROFILE=loaded\nprint "startup banner"\n');
    const startup =
      mode === "retry"
        ? "export PATH=/discarded\nexit 42"
        : mode === "timeout"
          ? 'print $$ > "$HOME/pid"\ntrap "" TERM\nexec /bin/sleep 30'
          : 'export SHELL_TEST_INTERACTIVE="quotes and spaces"';
    await writeFile(join(home, ".zshrc"), startup);
    await writeFile(join(home, ".zlogout"), 'print "logout noise"\n');
    if (mode === "failure") await writeFile(join(home, ".zshenv"), 'print "sensitive startup output"\nexit 42\n');

    syncShellEnvironment({env, warn: (message) => warnings.push(message)});

    if (mode === "failure") {
      expect(env).toEqual(inherited);
      expect(warnings).toHaveLength(2);
      expect(warnings.join("\n")).not.toContain("sensitive");
    } else {
      expect(env.PATH?.split(":")[0]).toBe(join(home, "tools"));
      expect(env.SHELL_TEST_PROFILE).toBe("loaded");
      expect(env.SHELL_TEST_INTERACTIVE).toBe(mode === "interactive" ? "quotes and spaces" : undefined);
      expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
      expect(env.ELECTRON_NO_ATTACH_CONSOLE).toBeUndefined();
      expect(warnings).toHaveLength(mode === "interactive" ? 0 : 1);
    }
    if (mode === "timeout") {
      const pid = Number(await readFile(join(home, "pid"), "utf8"));
      expect(() => process.kill(pid, 0)).toThrow();
    }
  } finally {
    await rm(home, {recursive: true, force: true});
  }
});
