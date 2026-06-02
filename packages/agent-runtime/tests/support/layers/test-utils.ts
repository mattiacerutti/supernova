import {rmSync} from "node:fs";

interface WaitUntilOptions {
  readonly intervalMs?: number;
  readonly label?: string;
  readonly timeoutMs?: number;
}

export async function waitUntil(assertion: () => Promise<void> | void, options: WaitUntilOptions = {}): Promise<void> {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 2_000;
  const intervalMs = options.intervalMs ?? 5;
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  if (lastError instanceof Error && options.label) lastError.message = `${options.label}: ${lastError.message}`;
  throw lastError ?? new Error(options.label ?? `Timed out after ${timeoutMs}ms`);
}

export function cleanupTempDirs(tempDirs: string[]): void {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, {force: true, recursive: true});
}
