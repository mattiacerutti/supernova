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

  test("takes a paste larger than one socket message", async ({app, project}) => {
    await openTerminal(app.page);
    // 1.5 MiB, past the server's 1 MiB message limit; xterm hands a paste over in one piece.
    const text = "0123456789abcdef".repeat(98_304);
    // Raw, so the tty's line limit does not cut the input; `head` stops after exactly the pasted bytes. The marker says
    // raw mode is on, as the paste must not arrive before it.
    await typeInTerminal(app.page, `stty raw -echo; : > raw.txt; head -c ${text.length} > pasted.txt; stty sane`);
    await expect.poll(() => project.read("raw.txt")).toBe("");
    await app.page.getByRole("region", {name: "Project workspace"}).getByRole("textbox", {name: "Terminal input"}).focus();
    await app.page.evaluate((pasted) => {
      const data = new DataTransfer();
      data.setData("text/plain", pasted);
      document.activeElement?.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}));
    }, text);
    await expect.poll(async () => (await project.read("pasted.txt"))?.length, {timeout: 20_000}).toBe(text.length);
  });

  test("while the terminal reconnects, sends typing once it is back and drops a paste too large to hold, whole", async ({app, project}) => {
    // Every terminal channel passes through here, so the test can hold one closed.
    let blocked = false;
    const open = new Set<{close: () => Promise<void>}>();
    await app.page.routeWebSocket(/\/terminal/, (ws) => {
      if (blocked) return void ws.close();
      ws.connectToServer();
      open.add(ws);
      ws.onClose(() => open.delete(ws));
    });
    await openTerminal(app.page);
    await typeInTerminal(app.page, "echo before > before.txt");
    await expect.poll(() => project.read("before.txt")).toBe("before\n");

    blocked = true;
    for (const ws of [...open]) await ws.close();
    // Larger than what the tab holds while disconnected; its end alone must never reach the shell.
    const paste = `echo ${"x".repeat(70_000)}; echo tail > partial.txt`;
    await app.page.getByRole("region", {name: "Project workspace"}).getByRole("textbox", {name: "Terminal input"}).focus();
    await app.page.evaluate((pasted) => {
      const data = new DataTransfer();
      data.setData("text/plain", pasted);
      document.activeElement?.dispatchEvent(new ClipboardEvent("paste", {clipboardData: data, bubbles: true, cancelable: true}));
    }, paste);
    await app.page.keyboard.type("echo held > held.txt");
    await app.page.keyboard.press("Enter");

    // A partial paste would leave the shell inside an unfinished command, so the typing after it would never run.
    blocked = false;
    await expect.poll(() => project.read("held.txt"), {timeout: 15_000}).toBe("held\n");
    expect(await project.read("partial.txt")).toBeUndefined();
  });
});
