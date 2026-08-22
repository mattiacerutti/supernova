import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {describe, expect, it} from "vitest";
import {findPiSessionPath} from "@supernova/agent-runtime/layers/shared/internal/pi-session-store";

describe("Pi session store", () => {
  it("finds standard session filenames without descending into archives", async () => {
    const sessionsDir = await mkdtemp(join(tmpdir(), "supernova-session-paths-"));
    const projectDir = join(sessionsDir, "--project--");
    const archiveDir = join(sessionsDir, "--other-project--", "archive");
    const expectedPath = join(projectDir, "2026-01-01T00-00-00-000Z_session-1.jsonl");

    try {
      await mkdir(projectDir);
      await mkdir(archiveDir, {recursive: true});
      await writeFile(expectedPath, "");
      await writeFile(join(archiveDir, "2026-01-01T00-00-00-000Z_session-1.jsonl"), "");

      await expect(findPiSessionPath("session-1", sessionsDir)).resolves.toBe(expectedPath);
      await expect(findPiSessionPath("missing", sessionsDir)).resolves.toBeUndefined();
    } finally {
      await rm(sessionsDir, {force: true, recursive: true});
    }
  });
});
