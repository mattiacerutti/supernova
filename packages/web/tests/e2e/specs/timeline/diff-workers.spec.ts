import type {Worker} from "@playwright/test";
import {expect, test} from "@e2e/support/timeline-fixture";

test.beforeEach(async ({page, timeline}) => {
  await page.emulateMedia({colorScheme: "dark"});
  await timeline.openDiffSession();
  for (const button of [page.getByRole("button", {name: /^Worked for/}), page.getByRole("button", {name: "Edited 2 files", exact: true})]) {
    await button.click();
    await expect.poll(() => button.locator("xpath=following-sibling::div").evaluate((element) => element.getAnimations().length)).toBe(0);
  }
});

test("reuses the two-worker highlighting pool after the group remounts", async ({page}) => {
  const workers: Worker[] = [];
  page.on("worker", (worker) => workers.push(worker));
  const row = page
    .locator('[class~="group/row"]')
    .filter({has: page.getByRole("button", {name: /^Wrote worker.ts/})})
    .first();
  await row.getByRole("button").click();
  const lines = row.locator("diffs-container [data-line]");
  await expect(lines.first()).toContainText("first0");
  await expect(row.locator("diffs-container [data-line] span[style]").first()).toBeVisible();
  expect(workers).toHaveLength(2);
  const output = row.locator("[data-scrollable]");
  await output.evaluate((element) => {
    element.scrollTop = 480;
  });
  await expect.poll(() => output.evaluate((element) => element.scrollTop)).toBe(480);

  const group = page.getByRole("button", {name: "Edited 2 files", exact: true});
  await group.click();
  await expect(row).toHaveCount(0);
  await group.click();
  await expect(lines.first()).toContainText("first0");
  await expect.poll(() => output.evaluate((element) => element.scrollTop)).toBe(0);
  expect(workers).toHaveLength(2);
});

test("keeps different revisions of the same path separate in the worker cache", async ({page}) => {
  const rows = page.locator('[class~="group/row"]').filter({has: page.getByRole("button", {name: /^Wrote worker.ts/})});
  for (const [index, version] of ["first", "second"].entries()) {
    const row = rows.nth(index);
    await row.getByRole("button").click();
    await expect(row.locator("diffs-container [data-line]").first()).toContainText(`${version}0`);
    await expect(row.locator("diffs-container [data-line] span[style]").first()).toBeVisible();
  }
  const group = page.getByRole("button", {name: "Edited 2 files", exact: true});
  await group.click();
  await expect(rows).toHaveCount(0);
  await group.click();
  for (const [index, version] of ["first", "second"].entries()) {
    await expect(rows.nth(index).locator("diffs-container [data-line]").first()).toContainText(`${version}0`);
  }
});

test("updates highlighted diff colors when the system appearance changes", async ({page}) => {
  await page
    .getByRole("button", {name: /^Wrote worker.ts/})
    .first()
    .click();
  const token = page.locator("diffs-container [data-line] span[style]").first();
  await expect(token).toBeVisible();
  const darkColor = await token.evaluate((element) => getComputedStyle(element).color);
  await page.emulateMedia({colorScheme: "light"});
  await expect(page.locator("html")).toHaveAttribute("data-color-mode", "light");
  await expect(token).toBeVisible();
  await expect.poll(() => token.evaluate((element) => getComputedStyle(element).color)).not.toBe(darkColor);
  await page.emulateMedia({colorScheme: "dark"});
  await expect.poll(() => token.evaluate((element) => getComputedStyle(element).color)).toBe(darkColor);
});

test("renders a plain-text diff as the first viewer", async ({page}) => {
  const button = page.getByRole("button", {name: /^Wrote notes.txt/});
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("diffs-container [data-line]").first()).toContainText("Plain note 0");
  await page.locator('[class~="group/row"] [data-scrollable]').evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator("diffs-container [data-line]").last()).toContainText("Plain note 99");
});

test("can close and reopen a group while its diff worker is loading", async ({page}) => {
  let release: () => void;
  let requested: () => void;
  const loading = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/assets\/worker-[^/]+\.js$/, async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  try {
    await page
      .getByRole("button", {name: /^Wrote worker.ts/})
      .first()
      .click();
    await loading;
    const group = page.getByRole("button", {name: "Edited 2 files", exact: true});
    await group.click();
    await expect(page.locator('[class~="group/row"]')).toHaveCount(0);
    release!();
    await group.click();
    await expect(page.locator("diffs-container [data-line]").first()).toContainText("first0");
    await expect(page.locator("diffs-container [data-line] span[style]").first()).toBeVisible();
    await expect(page.locator("diffs-container")).toHaveCount(1);
  } finally {
    release!();
  }
});

test("keeps the diff readable when the worker script cannot load", async ({page}) => {
  await page.route(/\/assets\/worker-[^/]+\.js$/, (route) => route.abort());
  await page
    .getByRole("button", {name: /^Wrote worker.ts/})
    .first()
    .click();
  await expect(page.locator("diffs-container [data-line]").first()).toContainText("first0");
});
