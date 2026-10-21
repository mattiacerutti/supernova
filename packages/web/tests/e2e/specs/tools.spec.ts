import {expect, test} from "@tests/e2e/harness/fixtures";

test.describe("a turn that uses tools", () => {
  test.use({projectFiles: {"README.md": "# Project readme\n", "notes.txt": "n\n"}});

  test("runs each tool on the project, gives the model the results, and folds the work behind the answer", async ({app, model}) => {
    model.useTools(
      [
        {name: "bash", arguments: {command: "ls"}},
        {name: "read", arguments: {path: "README.md"}},
        {name: "read", arguments: {path: "missing.md"}},
      ],
      "The project has a readme."
    );

    await app.composer.send("What is in the project?");
    await expect(app.timeline.text("The project has a readme.")).toBeVisible();
    // A settled turn's folded work is not rendered until opened, so long histories stay cheap.
    await expect(app.timeline.tool(/^Ran\s*ls/)).toHaveCount(0);

    const [listing, readme, missing] = model.requests[1]!.toolResults;
    expect(listing).toMatch(/README\.md\s+notes\.txt/);
    expect(readme).toContain("# Project readme");
    expect(missing).toMatch(/ENOENT|not found|no such file/i);

    await app.timeline.expandWork("Ran 1 command · read 2 files · 1 failed");
    await app.timeline.tool(/^Ran\s*ls/).click();
    await expect(app.timeline.text(/README\.md\s+notes\.txt/)).toBeVisible();
    await app.timeline.tool(/^Read\s*missing\.md/).click();
    await expect(app.timeline.text(/ENOENT|not found|no such file/i)).toBeVisible();

    await app.reload();
    await expect(app.timeline.text("The project has a readme.")).toBeVisible();
    await expect(app.timeline.tool(/^Ran\s*ls/)).toHaveCount(0);
    await app.timeline.expandWork("Ran 1 command · read 2 files · 1 failed");
    await expect(app.timeline.tool(/^Ran\s*ls/)).toBeVisible();
  });

  test("an edit the model makes lands on disk and shows its diff size", async ({app, model, project}) => {
    model.useTools([{name: "edit", arguments: {path: "notes.txt", edits: [{oldText: "n\n", newText: "n\nmore\n"}]}}], "Added a line.");

    await app.composer.send("Add a line to the notes");
    await expect(app.timeline.text("Added a line.")).toBeVisible();

    expect(await project.read("notes.txt")).toBe("n\nmore\n");
    await app.timeline.expandWork("Edited 1 file");
    await expect(app.timeline.tool(/^Edited\s*notes\.txt\s*\+1\s*-0/)).toBeVisible();
  });
});
