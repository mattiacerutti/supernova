import type {App} from "@tests/e2e/harness/app";
import {expect, test} from "@tests/e2e/harness/fixtures";
import {ScriptedModel} from "@tests/e2e/harness/model-server";

test.describe("managing sessions", () => {
  test.beforeEach(async ({app, model}) => {
    model.reply("First answer.");
    await app.composer.send("First question");
    await expect(app.timeline.text("First answer.")).toBeVisible();
  });

  test("a rename is kept, and a later generated title never replaces it", async ({app, model}) => {
    await app.sidebar.rename(ScriptedModel.title, "My refactor");
    await expect(app.sessionTitle()).toHaveText("My refactor");

    model.reply("Second answer.");
    await app.composer.send("Second question");
    await expect(app.timeline.text("Second answer.")).toBeVisible();

    await app.reload();
    await expect(app.sessionTitle()).toHaveText("My refactor");
    await expect(app.sidebar.session("My refactor")).toBeVisible();
  });

  test("a pinned session lists first, and stays pinned after a reload", async ({app, model}) => {
    await app.sidebar.rename(ScriptedModel.title, "Older");
    await app.page.getByRole("button", {exact: true, name: /^New session in /}).click();
    model.reply("Newer answer.");
    await app.composer.send("Newer question");
    await expect(app.timeline.text("Newer answer.")).toBeVisible();
    await app.sidebar.rename(ScriptedModel.title, "Newer");
    await expect.poll(() => app.sidebar.titles()).toEqual(["Newer", "Older"]);

    await app.sidebar.act("Older", "Pin chat");
    await expect.poll(() => app.sidebar.titles()).toEqual(["Older", "Newer"]);
    await expect(app.sidebar.session("Older").getByRole("img", {name: "Pinned session"})).toBeVisible();

    await app.reload();
    await expect.poll(() => app.sidebar.titles()).toEqual(["Older", "Newer"]);
  });

  test("a fork copies the conversation up to a message into a new session and leaves the original", async ({app, model}) => {
    model.reply("Second answer.");
    await app.composer.send("Second question");
    await expect(app.timeline.text("Second answer.")).toBeVisible();
    await app.sidebar.rename(ScriptedModel.title, "Original");
    const original = app.page.url();

    const answer = app.timeline.root.locator("article").filter({has: app.page.getByText("First answer.", {exact: true})});
    await answer.hover();
    await answer.getByRole("button", {name: "Fork from this message"}).click();
    await app.page.getByRole("dialog", {name: "Fork session?"}).getByRole("button", {name: "Fork"}).click();

    await expect(app.page).not.toHaveURL(original);
    await app.timeline.expectExchange("First question", "First answer.");
    await expect(app.timeline.text("Second question")).toHaveCount(0);
    // The fork keeps the source's title; only its marker tells them apart.
    const forked = app.sidebar.session("Original").filter({has: app.page.getByRole("img", {name: "Forked session"})});
    await expect(forked).toHaveCount(1);

    await app.page.goto(original);
    await app.timeline.expectExchange("First question", "First answer.", "Second question", "Second answer.");
  });

  test("the sidebar's activity time keeps counting while nothing changes", async ({app}) => {
    await app.page.clock.install();
    await app.reload();
    const row = app.sidebar.session(ScriptedModel.title);
    await expect(row.getByText("now", {exact: true})).toBeVisible();

    await app.page.clock.runFor("02:00");

    // Labels refresh on wall-clock minute boundaries, so two minutes later the label reads 1m or 2m.
    await expect(row.getByText(/^[12]m$/)).toBeVisible();
  });

  test("archiving a session removes it from the sidebar and returns to a new session", async ({app}) => {
    await app.sidebar.rename(ScriptedModel.title, "To archive");

    await app.sidebar.act("To archive", "Archive chat");

    await expect(app.page.getByRole("heading", {name: /What should we build in/})).toBeVisible();
    await expect(app.sidebar.session("To archive")).toHaveCount(0);
    await app.reload();
    await expect(app.sidebar.session("To archive")).toHaveCount(0);
  });
});

test.describe("starting a session", () => {
  test("focuses the composer on a new session, so typing needs no click", async ({app}) => {
    await expect(app.composer.editor).toBeFocused();
    await app.page.keyboard.type("Start building");
    await expect(app.composer.editor).toHaveText("Start building");
  });

  test("focuses the composer on a new session opened from the command palette", async ({app, model, project}) => {
    model.reply("Answer.");
    await app.composer.send("First");
    await expect(app.timeline.text("Answer.")).toBeVisible();

    await app.page.keyboard.press("ControlOrMeta+k");
    await app.page.getByRole("textbox", {name: "Search sessions and actions"}).fill("New session");
    await app.page.getByText("New session in…", {exact: true}).click();
    await app.page.getByRole("dialog").getByText(project.project.name, {exact: true}).click();
    await expect(app.page.getByRole("dialog")).toHaveCount(0);

    await expect(app.composer.editor).toBeFocused();
    await app.page.keyboard.type("From the palette");
    await expect(app.composer.editor).toHaveText("From the palette");
  });

  test("keeps one draft per project until it is sent, then starts a fresh one", async ({app, model, project}) => {
    model.reply("Other answer.");
    await app.composer.send("Other session");
    await expect(app.timeline.text("Other answer.")).toBeVisible();
    await project.project.startSession();
    await app.composer.editor.fill("Half-written");
    const draft = app.page.url();

    await app.sidebar.open(ScriptedModel.title);
    await project.project.startSession();
    expect(app.page.url(), "the draft is the project's one new session").toBe(draft);
    await expect(app.composer.editor).toBeFocused();
    await app.page.keyboard.type(" more");
    await expect(app.composer.editor).toHaveText("Half-written more");

    model.reply("Draft answer.");
    await app.composer.submit();
    await expect(app.timeline.text("Draft answer.")).toBeVisible();
    await expect(app.page).toHaveURL(`/session/${new URL(draft).searchParams.get("draft")}`);

    await project.project.startSession();
    expect(app.page.url(), "the next new session gets its own id").not.toBe(draft);
    await expect(app.composer.editor).toHaveText("");
    await expect(app.composer.editor).toBeFocused();
  });

  test.describe("in a new worktree", () => {
    const chooseWorktree = async (app: App) => {
      await app.page.getByRole("button", {name: "Select workspace"}).click();
      await app.page.getByRole("menu").getByRole("menuitem", {name: "New worktree"}).click();
    };

    test.use({projectFiles: {"README.md": "# Readme\n"}, projectGit: true});

    test("runs the session in its own checkout, leaving the project's untouched", async ({app, model, project}) => {
      model.useTools([{name: "write", arguments: {path: "from-worktree.txt", content: "w\n"}}], "Wrote it.");

      await chooseWorktree(app);
      await app.composer.send("Write a file");

      await expect(app.timeline.text("Wrote it.")).toBeVisible();
      await expect(app.sidebar.session(ScriptedModel.title).getByRole("img", {name: "Worktree session"})).toBeVisible();
      expect(await project.read("from-worktree.txt"), "the project's own checkout is untouched").toBeUndefined();
    });

    test("that cannot be created returns to the new-session screen with the message kept", async ({app, project}) => {
      await chooseWorktree(app);
      // The base branch disappears between choosing it and sending, as when another tool deletes it.
      await project.git("branch", "-m", "main", "renamed");

      await app.composer.send("Build the thing");

      await expect(app.page.getByText("Unable to start the session")).toBeVisible();
      await expect(app.page.getByRole("heading", {name: /What should we build in/})).toBeVisible();
      await expect(app.composer.editor).toHaveText("Build the thing");
      await expect(app.sidebar.session(ScriptedModel.title)).toHaveCount(0);
    });
  });
});
