import type {Locator, Page} from "@playwright/test";
import {LARGE_DIFF_SESSION_ID, LARGE_DIFF_SESSION_TITLE} from "@e2e/mocks/timeline-data";
import {expect, test} from "@e2e/support/timeline-fixture";

async function openDiff(page: Page, name: RegExp) {
  const button = page.getByRole("button", {name});
  await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => button.locator("xpath=following-sibling::div").evaluate((element) => element.getAnimations().length)).toBe(0);
  await expect(page.locator("diffs-container [data-line]").first()).toBeVisible();
}

async function scrollToEnd(output: Locator, text: string) {
  await expect
    .poll(() =>
      output.evaluate(async (element, text) => {
        element.scrollTop = element.scrollHeight;
        await new Promise(requestAnimationFrame);
        const lines = element.querySelector("diffs-container")?.shadowRoot?.querySelectorAll("[data-line]");
        const line = lines?.[lines.length - 1];
        return !!line && line.textContent?.includes(text) && line.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom;
      }, text)
    )
    .toBe(true);
}

test.beforeEach(async ({page}) => {
  await page.goto(`/session/${LARGE_DIFF_SESSION_ID}`);
  await expect(page.getByRole("heading", {name: LARGE_DIFF_SESSION_TITLE})).toBeVisible();
  for (const button of [page.getByRole("button", {name: /^Worked for/}), page.getByRole("button", {name: "Edited 2 files", exact: true})]) {
    await button.click();
    await expect.poll(() => button.locator("xpath=following-sibling::div").evaluate((element) => element.getAnimations().length)).toBe(0);
  }
});

for (const {kind, name, last} of [
  {kind: "write", name: /^Wrote worker.ts/, last: "first999"},
  {kind: "edit", name: /^Edited worker.ts/, last: "updated50499"},
] as const) {
  test.describe(kind, () => {
    test.use({contextOptions: {reducedMotion: kind === "edit" ? "reduce" : "no-preference"}});

    test("bounds mounted lines, reaches the end, and reopens at the start", async ({page}) => {
      await openDiff(page, name);
      const lines = page.locator("diffs-container [data-line]");
      await expect.poll(() => lines.count()).toBeLessThan(200);
      const output = page.locator('[class~="group/row"] [data-scrollable]').first();
      await scrollToEnd(output, last);
      await expect(lines.last()).toBeInViewport();
      await expect.poll(() => lines.count()).toBeLessThan(200);

      const group = page.getByRole("button", {name: "Edited 2 files", exact: true});
      await group.click();
      await expect(output).toHaveCount(0);
      await group.click();
      await expect(page.getByRole("button", {name})).toHaveAttribute("aria-expanded", "true");
      await expect(lines.first()).toBeVisible();
      await expect.poll(() => output.evaluate((element) => element.scrollTop)).toBe(0);
    });

    test("keeps the visible wrapped source line while resizing", async ({page}) => {
      await openDiff(page, name);
      const output = page.locator('[class~="group/row"] [data-scrollable]').first();
      await scrollToEnd(output, last);
      await output.evaluate((element) => {
        element.scrollTop -= 150;
      });
      const anchor = await output.evaluate((element) => {
        const top = element.getBoundingClientRect().top;
        const line = [...element.querySelector("diffs-container")!.shadowRoot!.querySelectorAll<HTMLElement>("[data-line]")].find(
          (line) => line.getBoundingClientRect().bottom > top
        )!;
        return {index: line.dataset.lineIndex!, offset: line.getBoundingClientRect().top - top};
      });
      for (const width of [900, 1100, 1280]) {
        await page.setViewportSize({width, height: 800});
        await expect
          .poll(() =>
            output.evaluate(
              (element, anchor) =>
                new Promise<boolean>((resolve) => {
                  let frames = 0;
                  let stable = true;
                  const sample = () => {
                    const line = element.querySelector("diffs-container")?.shadowRoot?.querySelector(`[data-line][data-line-index="${anchor.index}"]`);
                    stable &&= !!line && Math.abs(line.getBoundingClientRect().top - element.getBoundingClientRect().top - anchor.offset) < 1;
                    if (++frames === 4) resolve(stable);
                    else requestAnimationFrame(sample);
                  };
                  requestAnimationFrame(sample);
                }),
              anchor
            )
          )
          .toBe(true);
      }
      await expect.poll(() => page.locator("diffs-container [data-line]").count()).toBeLessThan(200);
    });
  });
}

test("copies native partial-text selections from visible lines", async ({page, context}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openDiff(page, /^Wrote worker.ts/);
  await expect(page.locator("diffs-container [data-line] span[style]").first()).toBeVisible();
  const points = await page
    .locator("diffs-container [data-line]")
    .nth(1)
    .evaluate((element) => {
      const text = element.querySelector("span")!.firstChild!;
      const range = document.createRange();
      range.setStart(text, 1);
      range.setEnd(text, 4);
      const rect = range.getBoundingClientRect();
      return {x: rect.left, end: rect.right, y: rect.top + rect.height / 2, expected: range.toString()};
    });
  await page.mouse.move(points.x, points.y);
  await page.mouse.down();
  await page.mouse.move(points.end, points.y, {steps: 5});
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()!.toString())).toBe(points.expected);
  await page.keyboard.press("ControlOrMeta+c");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(points.expected);
});
