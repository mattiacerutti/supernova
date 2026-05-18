import {Effect} from "effect";
import {describe, expect, it} from "vitest";
import {listFolderFiles} from "@supernova/agent-runtime/implementations/filesystem/folders/operations/list-folder-files";
import {createProjectFixture} from "@tests/implementations/filesystem/folders/folder-test-utils";

describe("listing workspace file references", () => {
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
