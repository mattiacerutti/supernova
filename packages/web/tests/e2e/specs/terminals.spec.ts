import type {Page} from "@playwright/test";
import {expect, test} from "@tests/e2e/harness/fixtures";

// The terminal draws on a canvas, so these tests watch what the shell does in the project instead of reading pixels.
const openTerminal = async (page: Page) => {
  await page.getByRole("button", {name: "Show workspace"}).click();
  await page.getByRole("button", {name: "Open a workspace view"}).click();
  await page.getByRole("menuitem", {name: "Terminal"}).click();
  await expect(page.getByRole("tab", {name: "Terminal 1"})).toBeVisible();
};

// Panel layouts are per window, so another window starts empty and attaches to the running shell.
const attachTerminal = async (page: Page) => {
  await page.getByRole("button", {name: "Show workspace"}).click();
  await page.getByRole("button", {name: "Open a workspace view"}).click();
  await page.getByRole("menuitem", {name: "Terminal 1"}).click();
  await expect(page.getByRole("region", {name: "Project workspace"}).getByRole("textbox", {name: "Terminal input"})).toBeAttached();
};

const terminalStatus = (page: Page) => page.getByRole("region", {name: "Project workspace"}).getByRole("status");

// xterm labels its own textarea.
const typeInTerminal = async (page: Page, text: string) => {
  await page.getByRole("region", {name: "Project workspace"}).getByRole("textbox", {name: "Terminal input"}).focus();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
};

test.describe("terminals", () => {
  test.beforeEach(async ({app, model}) => {
    model.reply("Ready.");
    await app.composer.send("Open a terminal");
    await expect(app.timeline.text("Ready.")).toBeVisible();
  });

  test("runs commands in the project, and keeps the shell across a reload", async ({app, project}) => {
    await openTerminal(app.page);
    await typeInTerminal(app.page, "echo $((20+1)) > typed.txt");
    await expect.poll(() => project.read("typed.txt")).toBe("21\n");

    // A variable only the running shell knows: after the reload it is still there, so the tab reattached to it.
    await typeInTerminal(app.page, "KEPT=$((40+2))");
    await app.reload();
    await expect(app.page.getByRole("tab", {name: "Terminal 1"})).toBeVisible();
    await typeInTerminal(app.page, "echo $KEPT > kept.txt");
    await expect.poll(() => project.read("kept.txt")).toBe("42\n");
  });

  test("keeps answering while a command floods the terminal", async ({app, project}) => {
    await openTerminal(app.page);
    await typeInTerminal(app.page, "yes 0123456789012345678901234567890123456789 | head -n 200000; echo done > flooded.txt");
    await expect.poll(() => project.read("flooded.txt"), {timeout: 20_000}).toBe("done\n");
    await typeInTerminal(app.page, "echo after > after.txt");
    await expect.poll(() => project.read("after.txt")).toBe("after\n");
  });

  test("answers a program's question once, though two windows show its terminal", async ({app, project, context}) => {
    await openTerminal(app.page);
    const other = await context.newPage();
    await other.goto(app.page.url());
    await attachTerminal(other);

    // Everything that arrives as input within two seconds of the question: two answers would both be in the file.
    await typeInTerminal(
      app.page,
      "saved=$(stty -g); stty raw -echo min 0 time 20; printf '\\033[6n'; dd bs=1 count=64 2>/dev/null | od -An -c | tr -s ' \\n' ' ' > reply.txt; stty \"$saved\""
    );
    await expect.poll(() => project.read("reply.txt"), {timeout: 10_000}).toMatch(/^ ?033 \[ (\d ?)+; (\d ?)+R ?$/);
    await other.close();
  });

  test("tells the user the shell exited, with its code", async ({app}) => {
    await openTerminal(app.page);
    await typeInTerminal(app.page, "exit 3");
    await expect(terminalStatus(app.page)).toHaveText("Shell exited with code 3. Close this tab and open a new terminal to start another.");
  });

  test("tells the user the terminal was closed when another window kills it", async ({app, context}) => {
    await openTerminal(app.page);
    const other = await context.newPage();
    await other.goto(app.page.url());
    await attachTerminal(other);

    await other.getByRole("button", {name: "Close Terminal 1"}).click();
    await other.getByRole("button", {name: "Kill terminal"}).click();
    await expect(terminalStatus(app.page)).toHaveText("This terminal was closed. Close the tab and open a new terminal to start another.");
    await other.close();
  });
});
