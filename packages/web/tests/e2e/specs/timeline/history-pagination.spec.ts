import {expect, test} from "@e2e/support/timeline-fixture";

for (const {name, offset} of [
  {name: "near the loading threshold", offset: 350},
  {name: "after scrolling during the request", offset: 180},
  {name: "at the top boundary", offset: 0},
]) {
  test(`prepending variable-height pages preserves visible text ${name}`, async ({page, timeline}) => {
    await timeline.openPagedSession();
    const viewport = page.getByLabel("Session timeline");
    await viewport.hover();
    await page.mouse.wheel(0, -100);

    for (let request = 1; request <= 3; request += 1) {
      await viewport.evaluate((element) => {
        element.scrollTop = 350;
      });
      await expect.poll(() => page.evaluate(() => window.__supernovaTimelineMock!.getState().historyRequests)).toBe(request);
      await viewport.evaluate((element, offset) => {
        element.scrollTop = offset;
      }, offset);
      const result = await viewport.evaluate(async (element) => {
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const rect = element.getBoundingClientRect();
        const anchor = [...element.querySelectorAll<HTMLElement>(".session-markdown p")].find((paragraph) => {
          const bounds = paragraph.getBoundingClientRect();
          return bounds.top >= rect.top && bounds.bottom < rect.bottom;
        });
        if (!anchor) throw new Error("No fully visible paragraph to track");
        const before = anchor.getBoundingClientRect().top;
        const text = anchor.textContent;
        const firstIndex = () => Math.min(...[...element.querySelectorAll<HTMLElement>("[data-index]")].map((row) => Number(row.dataset.index)));
        const previousIndex = firstIndex();
        const samples: {top: number | null; text: string | null; overlaps: {index: number; nextIndex: number; pixels: number}[]}[] = [];
        const sample = () => {
          const current = [...element.querySelectorAll<HTMLElement>(".session-markdown p")].find((paragraph) => paragraph.textContent === text);
          const rows = [...element.querySelectorAll<HTMLElement>("[data-index]")].map((row) => ({index: Number(row.dataset.index), rect: row.getBoundingClientRect()}));
          const overlaps = rows.flatMap((row, index) =>
            rows.slice(index + 1).flatMap((next) => {
              const pixels = Math.min(row.rect.bottom, next.rect.bottom, rect.bottom) - Math.max(row.rect.top, next.rect.top, rect.top);
              return pixels > 1 ? [{index: row.index, nextIndex: next.index, pixels}] : [];
            })
          );
          samples.push({top: current?.getBoundingClientRect().top ?? null, text: current?.textContent ?? null, overlaps});
        };
        // ResizeObserver runs after animation-frame callbacks and can expose a bad layout that paints before
        // React's next commit removes rows outside the virtual range.
        const observer = new ResizeObserver(sample);
        observer.observe(element.querySelector("[data-timeline-virtual-content]")!);
        window.__supernovaTimelineMock!.releaseHistoryPage();
        await new Promise<void>((resolve) => {
          let committedFrames = 0;
          const frame = () => {
            sample();
            if (firstIndex() > previousIndex) committedFrames += 1;
            if (committedFrames >= 12) resolve();
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        observer.disconnect();
        return {before, text, samples};
      });
      expect(result.samples.length).toBeGreaterThanOrEqual(12);
      expect(
        result.samples.flatMap((sample) => sample.overlaps),
        `page ${request} must not paint overlapping rows`
      ).toEqual([]);
      expect(
        result.samples.filter((sample) => sample.top === null || Math.abs(sample.top - result.before) > 1 || sample.text !== result.text),
        `page ${request} must not flash different content or move the reading position: ${JSON.stringify(result)}`
      ).toEqual([]);
    }
    await expect(viewport.getByRole("status")).toHaveCount(0);
  });
}

test("upward wheel scrolling never paints other mounted rows over the reading position", async ({page, timeline}) => {
  await timeline.openPagedSession();
  const viewport = page.getByLabel("Session timeline");
  await viewport.hover();
  const observation = viewport.evaluate(
    (element) =>
      new Promise<{samples: number; overlaps: number[]}>((resolve) => {
        let samples = 0;
        const overlaps: number[] = [];
        const sample = () => {
          samples += 1;
          const bounds = element.getBoundingClientRect();
          const rows = [...element.querySelectorAll<HTMLElement>("[data-index]")].map((row) => row.getBoundingClientRect());
          for (const [index, row] of rows.entries()) {
            for (const next of rows.slice(index + 1)) {
              const overlap = Math.min(row.bottom, next.bottom, bounds.bottom) - Math.max(row.top, next.top, bounds.top);
              if (overlap > 1) overlaps.push(overlap);
            }
          }
        };
        // During wheel scrolling, rAF can see unmeasured rows that ResizeObserver corrects before paint.
        // Observe the resulting layout instead, including mounted rows awaiting React's next commit.
        const observer = new ResizeObserver(sample);
        observer.observe(element.querySelector("[data-timeline-virtual-content]")!);
        element.addEventListener(
          "stop-row-probe",
          () => {
            observer.disconnect();
            resolve({samples, overlaps});
          },
          {once: true}
        );
        element.setAttribute("data-row-probe-ready", "true");
      })
  );
  await expect(viewport).toHaveAttribute("data-row-probe-ready", "true");
  let released = 0;
  for (let gesture = 0; gesture < 48; gesture += 1) {
    await page.mouse.wheel(0, -700);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    const requests = await page.evaluate(() => window.__supernovaTimelineMock!.getState().historyRequests);
    if (requests > released) {
      await page.evaluate(() => window.__supernovaTimelineMock!.releaseHistoryPage());
      released = requests;
    }
    if (released === 3 && (await viewport.evaluate((element) => element.scrollTop === 0 && !element.querySelector("[data-timeline-earlier-history]")))) break;
  }
  await expect(viewport.getByRole("status")).toHaveCount(0);
  await viewport.dispatchEvent("stop-row-probe");
  const result = await observation;
  expect(result.samples).toBeGreaterThan(3);
  expect(result.overlaps, "no two transcript rows should occupy the same visible pixels, including after ResizeObserver").toEqual([]);
});
