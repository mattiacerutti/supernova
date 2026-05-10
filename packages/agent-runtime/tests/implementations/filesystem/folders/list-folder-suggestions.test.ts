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
    expect(result.suggestions).toEqual([{name: "alpha", path: join(tempDir, "alpha")}]);
  });
});
