import {expect, test} from "@tests/e2e/harness/fixtures";

test.describe("checkpoints", () => {
  test.use({projectFiles: {"notes.md": "original\n"}, projectGit: true});

  // TODO(pi-tasks): enable once checkpoints run as Pi tasks. The after-checkpoint lands after the turn reports finished, so
  // an undo right then restores the wrong checkpoint; pi-durable extensions cannot yet start a task at each turn's end.
  test.fixme("undo restores the files a turn changed, redo puts them back, and both survive a reload", async ({app, model, project}) => {
    model.reply("Nothing to change.");
    await app.composer.send("Look first");
    await expect(app.timeline.text("Nothing to change.")).toBeVisible();

    model.useTools([{name: "write", arguments: {path: "notes.md", content: "rewritten\n"}}], "Rewrote the notes.");
    await app.composer.send("Rewrite the notes");
    await expect(app.timeline.text("Rewrote the notes.")).toBeVisible();
    expect(await project.read("notes.md")).toBe("rewritten\n");

    await app.composer.command("undo");
    await expect(app.timeline.text("Rewrite the notes")).toHaveCount(0);
    await expect(app.page.getByRole("button", {name: "Expand rolled back messages"})).toBeVisible();
    await expect.poll(() => project.read("notes.md")).toBe("original\n");

    await app.reload();
    await expect(app.timeline.text("Rewrite the notes")).toHaveCount(0);
    await app.composer.command("redo");
    await app.timeline.expectExchange("Look first", "Rewrite the notes", "Rewrote the notes.");
    await expect.poll(() => project.read("notes.md")).toBe("rewritten\n");

    await app.reload();
    await app.timeline.expectExchange("Look first", "Rewrite the notes");
  });

  test.fixme("reverting to a message rolls back that turn and every later one, files included", async ({app, model, project}) => {
    model.useTools([{name: "write", arguments: {path: "a.txt", content: "a\n"}}], "Wrote a.");
    await app.composer.send("Write a");
    await expect(app.timeline.text("Wrote a.")).toBeVisible();
    model.useTools([{name: "write", arguments: {path: "b.txt", content: "b\n"}}], "Wrote b.");
    await app.composer.send("Write b");
    await expect(app.timeline.text("Wrote b.")).toBeVisible();

    const message = app.timeline.root.locator("article").filter({hasText: "Write a"});
    await message.hover();
    await message.getByRole("button", {name: "Revert to this message"}).click();

    await expect(app.timeline.text("Write a")).toHaveCount(0);
    await expect.poll(async () => [await project.read("a.txt"), await project.read("b.txt")]).toEqual([undefined, undefined]);
    expect(await project.read("notes.md")).toBe("original\n");
  });

  test("a new message after an undo replaces the undone turn, so there is nothing to redo", async ({app, model}) => {
    model.reply("First.").reply("Second.").reply("Replacement.");
    await app.composer.send("One");
    await expect(app.timeline.text("First.")).toBeVisible();
    await app.composer.send("Two");
    await expect(app.timeline.text("Second.")).toBeVisible();

    await app.composer.command("undo");
    await expect(app.timeline.text("Two")).toHaveCount(0);
    await app.composer.send("Instead");
    await expect(app.timeline.text("Replacement.")).toBeVisible();

    await expect(app.page.getByRole("button", {name: "Expand rolled back messages"})).toBeHidden();
    await app.timeline.expectExchange("One", "Instead");
    await expect(app.timeline.text("Two")).toHaveCount(0);
  });
});
