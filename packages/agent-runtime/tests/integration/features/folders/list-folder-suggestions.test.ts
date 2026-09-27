import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {afterEach, describe, expect, it} from "vitest";
import {Folders} from "@supernova/agent-runtime/features/folders/folders";

const folders = new Folders();
import {cleanupTempDirs} from "@tests/support/async";

describe("suggesting local folders", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    cleanupTempDirs(tempDirs);
  });

  it("suggests matching child directories for an absolute path query while ignoring hidden folders and files", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-folders-"));
    tempDirs.push(tempDir);
    await mkdir(join(tempDir, "alpha"));
    await mkdir(join(tempDir, "beta"));
    await mkdir(join(tempDir, ".alpha-hidden"));
    await writeFile(join(tempDir, "alpha.txt"), "not a directory");

    const result = await folders.listSuggestions({query: join(tempDir, "al")});

    expect(result.query).toBe(join(tempDir, "al"));
    expect(result.queryPathType).toBe("missing");
    expect(result.suggestions).toEqual([{name: "alpha", path: join(tempDir, "alpha")}]);

    const directoryResult = await folders.listSuggestions({query: `${tempDir}/`});
    expect(directoryResult.suggestions.map((suggestion) => suggestion.name)).toEqual([".alpha-hidden", "alpha", "beta"]);
  });

  it("reports the exact query path type", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "supernova-folders-"));
    tempDirs.push(tempDir);
    const filePath = join(tempDir, "file.txt");
    const folderPath = join(tempDir, "folder");
    await writeFile(filePath, "not a directory");
    await mkdir(folderPath);

    await expect(folders.listSuggestions({query: join(tempDir, "missing")})).resolves.toMatchObject({queryPathType: "missing"});
    await expect(folders.listSuggestions({query: filePath})).resolves.toMatchObject({queryPathType: "file"});
    await expect(folders.listSuggestions({query: folderPath})).resolves.toMatchObject({queryPathType: "directory"});
  });
});
