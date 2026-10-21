import {expect, test} from "@tests/e2e/harness/fixtures";

test.describe("composing a message", () => {
  test.use({
    projectFiles: {"src/session-store.ts": "export const store = 1;\n", "README.md": "# Readme\n"},
    projectSkills: [{name: "haiku-writer", description: "Answers in haiku", instructions: "Always answer in haiku."}],
  });

  test("an @ reference picks a project file, and the model receives its path", async ({app, model}) => {
    model.reply("Reviewed.");

    await app.composer.type("review @session-st");
    // With the caret back inside the token, picking a file still replaces the whole token.
    await app.composer.editor.press("ArrowLeft");
    await app.composer.editor.press("ArrowLeft");
    await expect(app.composer.suggestion("session-store.ts")).toBeVisible();
    await app.composer.editor.press("Enter");
    await app.composer.editor.press("End");
    await app.composer.type("please");
    await app.composer.submit();

    await expect(app.timeline.text("Reviewed.")).toBeVisible();
    expect(model.requests[0]?.prompt).toBe("review @src/session-store.ts please");
  });

  test("an @ inside a word stays text and opens no menu", async ({app, model}) => {
    model.reply("Noted.");

    await app.composer.type("mail user@session");
    await expect(app.page.getByText("Files", {exact: true})).toHaveCount(0);
    await app.composer.submit();

    await expect(app.timeline.text("Noted.")).toBeVisible();
    expect(model.requests[0]?.prompt).toBe("mail user@session");
  });

  test("a $ skill sends the skill's instructions with the message, once", async ({app, model}) => {
    model.reply("Leaves fall.");

    await app.composer.type("use $haiku");
    await expect(app.composer.suggestion("Haiku Writer")).toBeVisible();
    await app.composer.editor.press("Enter");
    await app.composer.type("now");
    await app.composer.submit();

    await expect(app.timeline.text("Leaves fall.")).toBeVisible();
    const [authored, ...rest] = model.requests[0]!.prompt.split("\n\n");
    expect(authored).toBe("use haiku-writer now");
    expect(rest.join("\n\n").match(/<name>haiku-writer<\/name>/g)).toHaveLength(1);
    expect(rest.join("\n\n")).toContain("Always answer in haiku.");
  });

  test("a text attachment reaches the model escaped and stays on the sent message; a binary file is refused", async ({app, model}) => {
    model.reply("Seen it.");

    await app.composer.attach({buffer: Buffer.from("if (a < b && c) {}\n"), mimeType: "application/octet-stream", name: "check.ts"});
    await expect(app.page.getByRole("button", {name: "Remove check.ts"})).toBeVisible();
    await app.composer.type("see file");
    await app.composer.submit();

    await expect(app.timeline.text("Seen it.")).toBeVisible();
    const prompt = model.requests[0]!.prompt;
    expect(prompt).toContain('name="check.ts" mime="text/plain"');
    expect(prompt).toContain("if (a &lt; b &amp;&amp; c) {}");
    await expect(app.timeline.root.locator("article").first().getByText("check.ts", {exact: true})).toBeVisible();

    await app.composer.attach({buffer: Buffer.from([0, 1, 2, 3]), mimeType: "application/octet-stream", name: "blob.bin"});
    await expect(app.page.getByText("blob.bin is not a supported attachment type.")).toBeVisible();
    await expect(app.page.getByRole("button", {name: "Remove blob.bin"})).toHaveCount(0);
  });

  test("pasted text keeps its line breaks, blank lines, and markup, also over a selection and in a restored draft", async ({app, model, project}) => {
    model.reply("Pasted.");

    await app.composer.type("before replace after");
    for (let index = 0; index < " after".length; index++) await app.composer.editor.press("ArrowLeft");
    for (let index = 0; index < "replace".length; index++) await app.composer.editor.press("Shift+ArrowLeft");
    await app.composer.paste({text: "concern:\r\n\r\n1. First\r2. Second\n\n<div>Please</div>\n  in order"});

    await project.project.startSession();
    await expect(app.composer.editor).toContainText("concern:");
    await app.composer.submit();

    await expect(app.timeline.text("Pasted.")).toBeVisible();
    expect(model.requests[0]?.prompt).toBe("before concern:\n\n1. First\n2. Second\n\n<div>Please</div>\n  in order after");
  });

  test("rich text pasted from another app keeps one line per paragraph", async ({app, model}) => {
    model.reply("Pasted.");

    await app.composer.paste({text: "concern:\n1. First\n\nPlease", html: "<p>concern:</p><p>1. First</p><p></p><p>Please</p>"});
    await app.composer.submit();

    await expect(app.timeline.text("Pasted.")).toBeVisible();
    expect(model.requests[0]?.prompt).toBe("concern:\n1. First\n\nPlease");
  });

  test("a multi-line message keeps its line breaks and loses surrounding blanks", async ({app, model}) => {
    model.reply("Two lines.");

    await app.composer.type("   first");
    await app.composer.editor.press("Shift+Enter");
    await app.composer.type("second   ");
    await app.composer.submit();

    await expect(app.timeline.text("Two lines.")).toBeVisible();
    expect(model.requests[0]?.prompt).toBe("first\nsecond");
  });
});
