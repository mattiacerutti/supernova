import {mkdtemp} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {createFolder} from "@supernova/agent-runtime/implementations/filesystem/folders/operations/create-folder";
import {listFolderSuggestions} from "@supernova/agent-runtime/implementations/filesystem/folders/operations/list-folder-suggestions";

describe("creating local workspace folders", () => {
  it("creates nested folders recursively", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-folder-create-"));
    const folderPath = join(tempDir, "nested", "project");

    const result = await Effect.runPromise(createFolder(folderPath));

    expect(result.path).toBe(folderPath);
    await expect(Effect.runPromise(listFolderSuggestions(folderPath))).resolves.toMatchObject({queryPathType: "directory"});
  });
});
