import {mkdir, mkdtemp, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {listFolderFiles} from "@pi-desktop/agent-runtime/implementations/filesystem/folders/operations/list-folder-files";

async function createProjectFixture(): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "pi-desktop-folder-files-"));
  await mkdir(join(tempDir, ".git"));
  await mkdir(join(tempDir, ".config"));
  await mkdir(join(tempDir, "features", "feature-one", "operations"), {recursive: true});
  await mkdir(join(tempDir, "src", "components"), {recursive: true});
  await writeFile(join(tempDir, "src", "components", "button.tsx"), "export const Button = null;");
  await writeFile(join(tempDir, "src", "session.ts"), "export const session = null;");
  await writeFile(join(tempDir, ".gitignore"), "ignored.ts\n");
  await writeFile(join(tempDir, ".env"), "SECRET=hidden");
  await writeFile(join(tempDir, "ignored.ts"), "ignored by fd");
  return tempDir;
}

describe("listFolderFiles", () => {
  it("returns fuzzy-ranked file reference suggestions", async () => {
    const tempDir = await createProjectFixture();

    const result = await Effect.runPromise(listFolderFiles(tempDir, "button"));

    expect(result.query).toBe("button");
    expect(result.items).toEqual([
      {
        path: "@src/components/button.tsx",
        subtitle: "src/components",
        title: "button.tsx",
      },
    ]);

    await expect(Effect.runPromise(listFolderFiles(tempDir, "ignored"))).resolves.toMatchObject({items: []});
  });

  it("returns directory suggestions with trailing slashes", async () => {
    const tempDir = await createProjectFixture();

    const result = await Effect.runPromise(listFolderFiles(tempDir, "components"));

    expect(result.items[0]).toEqual({
      path: "@src/components/",
      subtitle: "src",
      title: "components",
    });
  });

  it("scopes slash queries to the typed directory prefix", async () => {
    const tempDir = await createProjectFixture();

    const result = await Effect.runPromise(listFolderFiles(tempDir, "src/but"));

    expect(result.items).toEqual([
      {
        path: "@src/components/button.tsx",
        subtitle: "src/components",
        title: "button.tsx",
      },
    ]);
  });

  it("falls back to full-path search when a slash query does not start with an existing directory", async () => {
    const tempDir = await createProjectFixture();

    const result = await Effect.runPromise(listFolderFiles(tempDir, "feature-one/"));

    expect(result.items).toContainEqual({
      path: "@features/feature-one/operations/",
      subtitle: "features/feature-one",
      title: "operations",
    });
  });

  it("includes hidden paths while still respecting gitignore", async () => {
    const tempDir = await createProjectFixture();

    await expect(Effect.runPromise(listFolderFiles(tempDir, ".env"))).resolves.toMatchObject({
      items: [
        {
          path: "@.env",
          subtitle: undefined,
          title: ".env",
        },
      ],
    });
    await expect(Effect.runPromise(listFolderFiles(tempDir, "ignored"))).resolves.toMatchObject({items: []});
  });
});
