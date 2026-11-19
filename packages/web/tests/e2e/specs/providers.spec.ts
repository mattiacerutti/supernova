import type {Page} from "@playwright/test";
import {expect, test} from "@tests/e2e/harness/fixtures";

// Anthropic's API key login is one question and needs no network.
async function connectAnthropic(page: Page) {
  await page.goto("/settings/providers");
  await page.getByPlaceholder("Search providers").fill("Anthropic");
  const row = page.getByRole("group", {name: "Anthropic", exact: true});
  // The specs share their worker's server, so each one starts from a disconnected Anthropic.
  if (await row.getByRole("button", {name: "Disconnect"}).isVisible()) await row.getByRole("button", {name: "Disconnect"}).click();
  await row.getByRole("button", {name: "Connect"}).click();
  const dialog = page.getByRole("dialog", {name: "Connect Anthropic"});
  await dialog.getByRole("button", {name: "Use an API key"}).click();
  return {row, dialog};
}

test.describe("providers", () => {
  test("walks a login that asks a choice, shows its instructions, then a question", async ({app}) => {
    const {page} = app;
    await page.goto("/settings/providers");
    await page.getByPlaceholder("Search providers").fill("Amazon Bedrock");
    const row = page.getByRole("group", {name: "Amazon Bedrock", exact: true});
    await row.getByRole("button", {name: "Connect"}).click();
    const dialog = page.getByRole("dialog", {name: "Connect Amazon Bedrock"});

    await expect(dialog.getByText("Select Amazon Bedrock authentication method:")).toBeVisible();
    await dialog.getByRole("button", {name: "AWS profile"}).click();
    await expect(dialog.getByText("Amazon Bedrock supports AWS profiles, IAM credentials, and role-based credentials.")).toBeVisible();
    await expect(dialog.getByRole("link", {name: "AWS credential provider chain"})).toBeVisible();
    await dialog.getByLabel("Enter AWS profile name").fill("e2e");
    await dialog.getByRole("button", {name: "Continue"}).click();
    await expect(dialog.getByText("Provider configuration saved.")).toBeVisible();
    await dialog.getByRole("button", {name: "Close", exact: true}).click();

    await row.getByRole("button", {name: "Disconnect"}).click();
    await expect(row.getByRole("button", {name: "Connect"})).toBeVisible();
  });

  test("connects a provider with an API key, then disconnects it", async ({app}) => {
    const {row, dialog} = await connectAnthropic(app.page);

    await dialog.getByLabel("Enter Anthropic API key").fill("sk-e2e");
    await dialog.getByRole("button", {name: "Continue"}).click();
    await expect(dialog.getByText("Provider configuration saved.")).toBeVisible();
    await dialog.getByRole("button", {name: "Close", exact: true}).click();

    await expect(row.getByText("Connected", {exact: true})).toBeVisible();
    await row.getByRole("button", {name: "Disconnect"}).click();
    await expect(row.getByRole("button", {name: "Connect"})).toBeVisible();
  });

  test("cancels a login when its dialog closes, so the next one starts", async ({app}) => {
    const {row, dialog} = await connectAnthropic(app.page);
    await expect(dialog.getByLabel("Enter Anthropic API key")).toBeVisible();
    await dialog.getByRole("button", {name: "Cancel"}).click();
    await expect(dialog).toBeHidden();

    await row.getByRole("button", {name: "Connect"}).click();

    // A login left running would reopen the dialog on its question instead of the choice.
    await expect(dialog.getByRole("button", {name: "Use an API key"})).toBeVisible();
    await dialog.getByRole("button", {name: "Use an API key"}).click();
    await expect(dialog.getByLabel("Enter Anthropic API key")).toBeVisible();
  });
});
