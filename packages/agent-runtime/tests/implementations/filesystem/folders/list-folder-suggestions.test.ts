import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {listFolderSuggestions} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/list-folder-suggestions";

describe("listFolderSuggestions", () => {
  it("suggests matching child directories for an absolute path query while ignoring hidden folders and files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-desktop-folders-"));
    await mkdir(join(tempDir, "alpha"));
    await mkdir(join(tempDir, "beta"));
    await mkdir(join(tempDir, ".alpha-hidden"));
    await writeFile(join(tempDir, "alpha.txt"), "not a directory");

    const result = await Effect.runPromise(listFolderSuggestions(join(tempDir, "al")));

    expect(result.query).toBe(join(tempDir, "al"));
    expect(result.queryPathType).toBe("missing");
    expect(result.suggestions).toEqual([{name: "alpha", path: join(tempDir, "alpha")}]);
  });

  it("reports the exact query path type", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "pi-desktop-folders-"));
    const filePath = join(tempDir, "file.txt");
    const folderPath = join(tempDir, "folder");
    await writeFile(filePath, "not a directory");
    await mkdir(folderPath);

    await expect(Effect.runPromise(listFolderSuggestions(join(tempDir, "missing")))).resolves.toMatchObject({queryPathType: "missing"});
    await expect(Effect.runPromise(listFolderSuggestions(filePath))).resolves.toMatchObject({queryPathType: "file"});
    await expect(Effect.runPromise(listFolderSuggestions(folderPath))).resolves.toMatchObject({queryPathType: "directory"});
  });
});
