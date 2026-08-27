import {spawn} from "node:child_process";

const MAX_GIT_OUTPUT_BYTES = 128 * 1024 * 1024;

interface GitOutput {
  readonly stderr: string;
  readonly stdout: string;
}

interface GitProcessOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: Buffer;
}

/** Runs Git and returns its exit code alongside its output, so callers can decide what a failure means. */
export async function runGitResult(args: readonly string[], options: GitProcessOptions = {}): Promise<GitOutput & {readonly code: number}> {
  return new Promise((complete) => {
    const child = spawn("git", [...args], {cwd: options.cwd, env: options.env ?? process.env});
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let completed = false;

    function finish(code: number, errorMessage?: string): void {
      if (completed) return;
      completed = true;
      complete({
        code,
        stderr: errorMessage ?? Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8"),
      });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes <= MAX_GIT_OUTPUT_BYTES) stdout.push(chunk);
      else child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes <= MAX_GIT_OUTPUT_BYTES) stderr.push(chunk);
      else child.kill();
    });
    child.on("error", (cause) => finish(1, cause.message));
    child.on("close", (code) => finish(code ?? 1));
    child.stdin.on("error", () => undefined);
    child.stdin.end(options.input);
  });
}

/** Runs Git and throws when it fails. Failures carry Git's own message, which never reaches clients. */
export async function runGit(args: readonly string[], options: GitProcessOptions = {}): Promise<GitOutput> {
  const output = await runGitResult(args, options);
  if (output.code !== 0) throw new Error(`Git checkpoint command failed: ${output.stderr.trim() || args.join(" ")}`);
  return output;
}

/** Runs Git and returns its trimmed output, or undefined when the command fails or prints nothing. */
export async function optionalGit(args: readonly string[], options: GitProcessOptions = {}): Promise<string | undefined> {
  const output = await runGitResult(args, options);
  const value = output.stdout.trim();
  return output.code === 0 && value.length > 0 ? value : undefined;
}
