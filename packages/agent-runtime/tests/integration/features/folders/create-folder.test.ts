import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";

const folders = new Folders();
import {cleanupTempDirs} from "@tests/support/async";

describe("creating local workspace folders", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    cleanupTempDirs(tempDirs);
  });

  it("creates nested folders recursively", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-folder-create-"));
    tempDirs.push(tempDir);
    const folderPath = join(tempDir, "nested", "project");

    const result = await folders.create({path: folderPath});

    expect(result.path).toBe(folderPath);
    await expect(folders.listSuggestions({query: folderPath})).resolves.toMatchObject({queryPathType: "directory"});
  });
});
