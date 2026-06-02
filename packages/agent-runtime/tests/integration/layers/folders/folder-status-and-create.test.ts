import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect} from "effect";
import {afterEach, describe, expect, it} from "vitest";
import {createFolder} from "@supernova/agent-runtime/layers/folders/operations/create-folder";
import {listFolderSuggestions} from "@supernova/agent-runtime/layers/folders/operations/list-folder-suggestions";
import {cleanupTempDirs} from "@tests/support/layers/test-utils";

describe("creating local workspace folders", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    cleanupTempDirs(tempDirs);
  });

  it("creates nested folders recursively", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-folder-create-"));
    tempDirs.push(tempDir);
    const folderPath = join(tempDir, "nested", "project");

    const result = await Effect.runPromise(createFolder(folderPath));

    expect(result.path).toBe(folderPath);
    await expect(Effect.runPromise(listFolderSuggestions(folderPath))).resolves.toMatchObject({queryPathType: "directory"});
  });
});
