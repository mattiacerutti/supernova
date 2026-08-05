import {existsSync, mkdirSync, rmSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {randomUUID} from "node:crypto";
import {expect, test} from "@playwright/test";
import type {Locator, Page} from "@playwright/test";

function resolveE2eRoot(): string {
  const root = process.env.SUPERNOVA_E2E_ROOT;
  if (!root) throw new Error("SUPERNOVA_E2E_ROOT is required.");
  return root;
}

const e2eRoot = resolveE2eRoot();

function projectId(projectPath: string): string {
  return Buffer.from(encodeURIComponent(projectPath)).toString("base64").replaceAll("=", "");
}

async function openProject(page: Page): Promise<string> {
  const projectPath = join(e2eRoot, "projects", randomUUID());
  const id = projectId(projectPath);
  mkdirSync(projectPath, {recursive: true});

  await page.addInitScript(
    ({id: storedProjectId, path}) => {
      localStorage.setItem(
        "supernova-projects",
        JSON.stringify({
          state: {projects: [{addedAt: new Date().toISOString(), id: storedProjectId, name: "runtime-e2e", path, pinned: false, pinnedSessionIds: []}]},
          version: 0,
        })
      );
      localStorage.setItem(
        "supernova-sidebar-sections",
        JSON.stringify({state: {expandedProjects: [storedProjectId], isPinnedCollapsed: false, isProjectsCollapsed: false, sidebarWidth: 288}, version: 0})
      );
    },
    {id, path: projectPath}
  );

  await page.goto(`/session/new?projectId=${encodeURIComponent(id)}`);
  await expect(page.getByRole("heading", {name: "What should we build in runtime-e2e?"})).toBeVisible();
  return id;
}

function sessionTimeline(page: Page): Locator {
  return page.getByLabel("Session timeline");
}

async function sendMessage(page: Page, prompt: string): Promise<void> {
  const editor = page.locator('[contenteditable="true"]').first();
  await expect(editor).toBeEditable();
  await editor.fill(prompt);
  await page.getByRole("button", {name: "Send message"}).click();
  await expect(sessionTimeline(page).getByText(prompt, {exact: true})).toHaveCount(1);
}

async function expectResponse(page: Page, prompt: string): Promise<void> {
  await expect(sessionTimeline(page).getByText(`Runtime response: ${prompt}`, {exact: true})).toBeVisible();
  await expect(page.getByRole("button", {name: "Send message"})).toBeVisible();
}

async function runCheckpointCommand(page: Page, command: "redo" | "undo"): Promise<void> {
  const editor = page.locator('[contenteditable="true"]').first();
  const suggestionName = command === "undo" ? /^Undo Roll back to the previous checkpoint$/ : /^Redo Restore the next undone checkpoint$/;
  await editor.fill(`/${command}`);
  await page.getByRole("button", {name: suggestionName}).click();
}

function controlPath(name: string): string {
  return join(e2eRoot, "control", name);
}

function resetControl(controlId: string): void {
  rmSync(controlPath(`release-${controlId}`), {force: true});
  rmSync(controlPath(`started-${controlId}`), {force: true});
}

test("creates a session, streams a response, and reloads the persisted conversation", async ({page}) => {
  const prompt = "Persist this workflow";

  await test.step("Create a session and receive a streamed response", async () => {
    await openProject(page);
    await sendMessage(page, prompt);
    await expect(page.getByRole("heading", {name: prompt})).toBeVisible();
    await expectResponse(page, prompt);
  });

  await test.step("Reload and verify the conversation was persisted", async () => {
    await page.reload();
    await expect(page.getByRole("heading", {name: prompt})).toBeVisible();
    await expect(sessionTimeline(page).getByText(prompt, {exact: true})).toHaveCount(1);
    await expect(sessionTimeline(page).getByText(`Runtime response: ${prompt}`, {exact: true})).toHaveCount(1);
  });
});

test("switching away and back during streaming never duplicates the active user message", async ({page}) => {
  const prompt = "Duplicate regression message";
  const id = await test.step("Create an alternate completed session", async () => {
    const projectId = await openProject(page);
    await sendMessage(page, "Create alternate session");
    await expectResponse(page, "Create alternate session");
    return projectId;
  });

  await test.step("Start a held response in a second session", async () => {
    await page.goto(`/session/new?projectId=${encodeURIComponent(id)}`);
    await expect(page.getByRole("heading", {name: "What should we build in runtime-e2e?"})).toBeVisible();
    resetControl("duplicate-message");
    await sendMessage(page, prompt);
    await expect(page.getByRole("heading", {name: prompt})).toBeVisible();
    await expect.poll(() => existsSync(controlPath("started-duplicate-message"))).toBe(true);
    await expect(page.getByRole("button", {name: "Stop streaming"})).toBeVisible();
  });

  await test.step("Switch away and back while the response is active", async () => {
    await page.locator("aside").getByText("Create alternate session", {exact: true}).click();
    await expect(page.getByRole("heading", {name: "Create alternate session"})).toBeVisible();
    await page.locator("aside").getByText(prompt, {exact: true}).click();
    await expect(page.getByRole("heading", {name: prompt})).toBeVisible();
    await expect(sessionTimeline(page).getByText(prompt, {exact: true})).toHaveCount(1);
  });

  await test.step("Complete the response without duplicating the user message", async () => {
    writeFileSync(controlPath("release-duplicate-message"), "");
    await expectResponse(page, prompt);
    await expect(sessionTimeline(page).getByText(prompt, {exact: true})).toHaveCount(1);
  });

  await test.step("Reload and verify the committed conversation", async () => {
    await page.reload();
    await expect(sessionTimeline(page).getByText(prompt, {exact: true})).toHaveCount(1);
    await expect(sessionTimeline(page).getByText(`Runtime response: ${prompt}`, {exact: true})).toHaveCount(1);
  });
});

test("stopping a response leaves the session able to send another message", async ({page}) => {
  const abortedPrompt = "Abort recovery message";

  await test.step("Start a held response", async () => {
    await openProject(page);
    resetControl("abort-recovery");
    await sendMessage(page, abortedPrompt);
    await expect.poll(() => existsSync(controlPath("started-abort-recovery"))).toBe(true);
  });

  await test.step("Stop the active response", async () => {
    await page.getByRole("button", {name: "Stop streaming"}).click();
    await expect(page.getByRole("button", {name: "Send message"})).toBeVisible();
  });

  await test.step("Send and receive another response in the same session", async () => {
    const recoveryPrompt = "Message after abort";
    await sendMessage(page, recoveryPrompt);
    await expectResponse(page, recoveryPrompt);
    await expect(sessionTimeline(page).getByText(abortedPrompt, {exact: true})).toHaveCount(1);
  });
});

test("reloading during streaming reconnects to the server-owned response", async ({page}) => {
  const prompt = "Reload during streaming message";

  await test.step("Start a held response", async () => {
    await openProject(page);
    resetControl("reload-streaming");
    await sendMessage(page, prompt);
    await expect.poll(() => existsSync(controlPath("started-reload-streaming"))).toBe(true);
  });

  await test.step("Reload while the provider request remains active", async () => {
    await page.reload();
    await expect(page.getByRole("heading", {name: prompt})).toBeVisible();
  });

  await test.step("Release and verify the response completes exactly once", async () => {
    writeFileSync(controlPath("release-reload-streaming"), "");
    await expectResponse(page, prompt);
    await expect(sessionTimeline(page).getByText(prompt, {exact: true})).toHaveCount(1);
    await expect(sessionTimeline(page).getByText(`Runtime response: ${prompt}`, {exact: true})).toHaveCount(1);
  });
});

test("a provider failure is shown and the session accepts another message", async ({page}) => {
  const failedPrompt = "Provider failure message";

  await test.step("Receive a provider error", async () => {
    await openProject(page);
    await sendMessage(page, failedPrompt);
    await expect(sessionTimeline(page).getByText("Synthetic provider failure.", {exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: "Send message"})).toBeVisible();
  });

  await test.step("Send a successful message after the failure", async () => {
    const recoveryPrompt = "Message after provider failure";
    await sendMessage(page, recoveryPrompt);
    await expectResponse(page, recoveryPrompt);
    await expect(sessionTimeline(page).getByText(failedPrompt, {exact: true})).toHaveCount(1);
  });
});

test("two sessions can run independently", async ({page}) => {
  const firstPrompt = "Concurrent session A message";
  const secondPrompt = "Concurrent session B message";

  await test.step("Start a held response in session A", async () => {
    await openProject(page);
    resetControl("concurrent-session-a");
    await sendMessage(page, firstPrompt);
    await expect.poll(() => existsSync(controlPath("started-concurrent-session-a"))).toBe(true);
  });

  await test.step("Complete a response in session B while session A is active", async () => {
    await page.getByRole("button", {exact: true, name: "New session in runtime-e2e"}).click();
    await expect(page.getByRole("heading", {name: "What should we build in runtime-e2e?"})).toBeVisible();
    await sendMessage(page, secondPrompt);
    await expectResponse(page, secondPrompt);
  });

  await test.step("Return to session A and complete its response", async () => {
    await page.locator("aside").getByText(firstPrompt, {exact: true}).click();
    await expect(page.getByRole("heading", {name: firstPrompt})).toBeVisible();
    await expect(page.getByRole("button", {name: "Stop streaming"})).toBeVisible();
    writeFileSync(controlPath("release-concurrent-session-a"), "");
    await expectResponse(page, firstPrompt);
    await expect(sessionTimeline(page).getByText(firstPrompt, {exact: true})).toHaveCount(1);
  });

  await test.step("Verify session B kept its own conversation", async () => {
    await page.locator("aside").getByText(secondPrompt, {exact: true}).click();
    await expect(sessionTimeline(page).getByText(secondPrompt, {exact: true})).toHaveCount(1);
    await expect(sessionTimeline(page).getByText(`Runtime response: ${secondPrompt}`, {exact: true})).toHaveCount(1);
  });
});

test("undo and redo survive a reload", async ({page}) => {
  const firstPrompt = "Undo first message";
  const secondPrompt = "Undo second message";

  await test.step("Complete two turns", async () => {
    await openProject(page);
    await sendMessage(page, firstPrompt);
    await expectResponse(page, firstPrompt);
    await sendMessage(page, secondPrompt);
    await expectResponse(page, secondPrompt);
  });

  await test.step("Undo the latest turn", async () => {
    await runCheckpointCommand(page, "undo");
    await expect(sessionTimeline(page).getByText(secondPrompt, {exact: true})).toHaveCount(0);
    await page.getByRole("button", {name: "Expand rolled back messages"}).click();
    await expect(page.getByRole("button", {name: "Restore rolled back message"})).toBeEnabled();
  });

  await test.step("Redo the latest turn", async () => {
    await runCheckpointCommand(page, "redo");
    await expect(sessionTimeline(page).getByText(secondPrompt, {exact: true})).toHaveCount(1);
    await expect(sessionTimeline(page).getByText(`Runtime response: ${secondPrompt}`, {exact: true})).toHaveCount(1);
  });

  await test.step("Reload and verify the restored transcript", async () => {
    await page.reload();
    await expect(sessionTimeline(page).getByText(firstPrompt, {exact: true})).toHaveCount(1);
    await expect(sessionTimeline(page).getByText(secondPrompt, {exact: true})).toHaveCount(1);
  });
});
