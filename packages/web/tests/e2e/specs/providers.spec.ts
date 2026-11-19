import type {Page} from "@playwright/test";
import {expect, test} from "@tests/e2e/harness/fixtures";

// Anthropic's API key login is one question and needs no network.
async function connectAnthropic(page: Page) {
  await page.goto("/settings/providers");
  await page.getByPlaceholder("Search providers").fill("Anthropic");
  const row = page.getByRole("group", {name: "Anthropic", exact: true});
  await row.getByRole("button", {name: "Connect"}).click();
  const dialog = page.getByRole("dialog", {name: "Connect Anthropic"});
  await dialog.getByRole("button", {name: "Use an API key"}).click();
  return {row, dialog};
}

test.describe("providers", () => {
  test("connects a provider with an API key, then disconnects it", async ({app}) => {
    const {page} = app;
    const {row, dialog} = await connectAnthropic(page);

    await dialog.getByLabel("Enter Anthropic API key").fill("sk-e2e");
    await dialog.getByRole("button", {name: "Continue"}).click();
    await expect(dialog.getByText("Provider configuration saved.")).toBeVisible();
    await dialog.getByRole("button", {name: "Close", exact: true}).click();

    await expect(page.getByRole("heading", {name: "Connected"})).toBeVisible();
    await expect(row.getByText("Connected", {exact: true})).toBeVisible();
    await row.getByRole("button", {name: "Disconnect"}).click();
    await expect(row.getByRole("button", {name: "Connect"})).toBeVisible();
  });

  test("cancels a login when its dialog closes", async ({app}) => {
    const {page} = app;
    const {row, dialog} = await connectAnthropic(page);
    await expect(dialog.getByLabel("Enter Anthropic API key")).toBeVisible();
    await dialog.getByRole("button", {name: "Cancel"}).click();
    await expect(dialog).toBeHidden();

    await row.getByRole("button", {name: "Connect"}).click();
    await dialog.getByRole("button", {name: "Use an API key"}).click();
    await expect(dialog.getByLabel("Enter Anthropic API key")).toBeVisible();
    await expect(dialog.getByText("A provider login is already in progress")).toBeHidden();
  });
});
