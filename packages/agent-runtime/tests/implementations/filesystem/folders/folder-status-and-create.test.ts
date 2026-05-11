import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {createFolder} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/create-folder";
import {listFolderSuggestions} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/list-folder-suggestions";

describe("folder status and creation", () => {
  it("creates nested folders recursively", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-desktop-folder-create-"));
    const folderPath = join(tempDir, "nested", "project");

    const result = await Effect.runPromise(createFolder(folderPath));

    expect(result.path).toBe(folderPath);
    await expect(Effect.runPromise(listFolderSuggestions(folderPath))).resolves.toMatchObject({queryPathType: "directory"});
  });
});
