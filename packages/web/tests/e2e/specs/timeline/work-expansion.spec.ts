import {expect, test} from "@e2e/support/timeline-fixture";

test("bounds mounted work on first expansion", async ({page, timeline}) => {
  await timeline.openWorkSession();
  const turn = page.getByRole("button", {name: /^Worked for/});
  const peak = await turn.evaluate(async (button) => {
    const viewport = document.querySelector('[aria-label="Session timeline"]')!;
    let paragraphs = 0;
    const observer = new MutationObserver(() => {
      paragraphs = Math.max(paragraphs, viewport.querySelectorAll(".session-markdown p").length);
    });
    observer.observe(viewport, {childList: true, subtree: true});
    (button as HTMLButtonElement).click();
    await new Promise<void>((resolve) =>
      button.nextElementSibling!.addEventListener("transitionend", (event) => {
        if (event.target === button.nextElementSibling && (event as TransitionEvent).propertyName === "grid-template-rows") resolve();
      })
    );
    observer.disconnect();
    return paragraphs;
  });
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThan(25);
});

test("bounds mounted calls when a historical group opens", async ({page, timeline}) => {
  await timeline.openWorkSession();
  const turn = page.getByRole("button", {name: /^Worked for/});
  await turn.click();
  await expect.poll(() => turn.locator("xpath=following-sibling::div").evaluate((element) => element.getAnimations().length)).toBe(0);
  const group = page.getByRole("button", {name: "Ran 60 commands", exact: true});
  const peak = await group.evaluate(async (button) => {
    let calls = 0;
    const count = () => {
      calls = Math.max(calls, [...document.querySelectorAll("button")].filter((element) => element.textContent?.includes("echo recorded-work-")).length);
    };
    const observer = new MutationObserver(count);
    observer.observe(button.parentElement!, {childList: true, subtree: true});
    (button as HTMLButtonElement).click();
    await new Promise<void>((resolve) =>
      button.nextElementSibling!.addEventListener("transitionend", (event) => {
        if (event.target === button.nextElementSibling && (event as TransitionEvent).propertyName === "grid-template-rows") resolve();
      })
    );
    count();
    observer.disconnect();
    return calls;
  });
  expect(peak).toBeGreaterThan(0);
  expect(peak).toBeLessThan(40);
});

test("defers closed work, then preserves nested expansion state across collapse and reopening", async ({page, timeline}) => {
  await timeline.openWorkSession();
  const turn = page.getByRole("button", {name: /^Worked for/});
  const group = page.getByRole("button", {includeHidden: true, name: "Ran 60 commands", exact: true});
  const command = page.getByRole("button", {includeHidden: true, name: "Ran echo recorded-work-0", exact: true});

  await expect(group).toHaveCount(0);
  await turn.click();
  await expect(group).toBeVisible();
  await expect(command).toHaveCount(0);

  await group.click();
  await command.click();
  await expect(command).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Recorded output 0", {exact: true})).toBeVisible();

  await turn.click();
  await expect(group).toHaveCount(0);

  await turn.click();
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(command).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Recorded output 0", {exact: true})).toBeVisible();
});

for (const reducedMotion of ["reduce", "no-preference"] as const) {
  test(`preserves open calls when their group scrolls out of the virtual window (${reducedMotion})`, async ({page, timeline}) => {
    await page.emulateMedia({reducedMotion});
    await timeline.openWorkSession();
    const viewport = page.getByLabel("Session timeline");
    await page.getByRole("button", {name: /^Worked for/}).click();
    const group = page.getByRole("button", {name: "Ran 60 commands", exact: true});
    const command = page.getByRole("button", {name: "Ran echo recorded-work-0", exact: true});
    await group.click();
    await command.click();
    await expect(page.getByText("Recorded output 0", {exact: true})).toBeVisible();
    await viewport.focus();
    await viewport.evaluate((element) => {
      element.scrollTop = 4500;
    });
    await expect(group).toHaveCount(0);
    await expect(command).toHaveCount(0);
    await expect(page.getByText(/^Recorded reasoning /).first()).toBeVisible();
    await viewport.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(group).toHaveAttribute("aria-expanded", "true");
    await expect(command).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Recorded output 0", {exact: true})).toBeVisible();
  });
}

for (const level of ["turn", "group"] as const) {
  test(`animates ${level} expansion and collapse without moving its header`, async ({page, timeline}) => {
    await timeline.openWorkSession();
    const turn = page.getByRole("button", {name: /^Worked for/});
    if (level === "group") {
      await turn.click();
      await expect.poll(() => turn.locator("xpath=following-sibling::div").evaluate((element) => element.getAnimations().length)).toBe(0);
    }
    const button = level === "turn" ? turn : page.getByRole("button", {name: "Ran 60 commands", exact: true});
    for (const opening of [true, false]) {
      const result = await button.evaluate(async (element) => {
        const body = element.nextElementSibling!;
        const viewport = element.closest('[aria-label="Session timeline"]')!;
        const headerTop = () => element.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
        const before = headerTop();
        const samples: {height: number; top: number}[] = [];
        (element as HTMLButtonElement).click();
        // Capture the complete 300/150 ms transition, including the frame after its content is released.
        const started = performance.now();
        await new Promise<void>((resolve) => {
          const sample = () => {
            samples.push({height: body.getBoundingClientRect().height, top: headerTop()});
            if (performance.now() - started >= 450) resolve();
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        return {before, samples};
      });
      const heights = result.samples.map((sample) => sample.height);
      const maximum = Math.max(...heights);
      expect(maximum).toBeGreaterThan(100);
      expect(heights.filter((height) => height > maximum * 0.1 && height < maximum * 0.9).length).toBeGreaterThan(2);
      expect(Math.max(...result.samples.map((sample) => Math.abs(sample.top - result.before))), JSON.stringify({opening, ...result})).toBeLessThanOrEqual(1);
      expect(opening ? heights.at(-1)! : heights[0]!).toBeGreaterThan(opening ? heights[0]! : heights.at(-1)!);
      if (!opening) expect(heights.at(-1)).toBe(0);
    }
  });
}

test("reverses an in-flight work collapse without losing the open group", async ({page, timeline}) => {
  await timeline.openWorkSession();
  const turn = page.getByRole("button", {name: /^Worked for/});
  await turn.click();
  const group = page.getByRole("button", {name: "Ran 60 commands", exact: true});
  await group.click();
  const result = await turn.evaluate(async (element) => {
    const body = element.nextElementSibling!;
    const fullHeight = body.getBoundingClientRect().height;
    (element as HTMLButtonElement).click();
    await new Promise<void>((resolve) => {
      const frame = () => {
        if (body.getBoundingClientRect().height < fullHeight * 0.8) resolve();
        else requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    const before = body.getBoundingClientRect().height;
    (element as HTMLButtonElement).click();
    await new Promise(requestAnimationFrame);
    return {before, after: body.getBoundingClientRect().height, fullHeight};
  });
  expect(result.before).toBeGreaterThan(0);
  expect(Math.abs(result.after - result.before)).toBeLessThan(result.fullHeight / 3);
  await expect(turn).toHaveAttribute("aria-expanded", "true");
  await expect(group).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", {name: "Ran echo recorded-work-0", exact: true})).toBeVisible();
});

test("retains the output reading position across virtual unmounts", async ({page, timeline}) => {
  await timeline.openWorkSession();
  const viewport = page.getByLabel("Session timeline");
  await page.getByRole("button", {name: /^Worked for/}).click();
  await page.getByRole("button", {name: "Ran 60 commands", exact: true}).click();
  const command = page.getByRole("button", {name: "Ran echo recorded-work-1", exact: true});
  await command.click();
  const output = page.locator('[data-scrollable="true"]', {hasText: "Output line 99"});
  await expect(output).toBeVisible();
  await output.evaluate((element) => {
    element.scrollTop = 180;
  });
  await expect.poll(() => output.evaluate((element) => element.scrollTop)).toBe(180);
  await viewport.focus();
  await viewport.evaluate((element) => {
    element.scrollTop = 4500;
  });
  await expect(command).toHaveCount(0);
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(command).toHaveAttribute("aria-expanded", "true");
  await expect.poll(() => output.evaluate((element) => element.scrollTop)).toBe(180);
});

test("keyboard traversal reaches calls beyond the first virtual window", async ({page, timeline}) => {
  await timeline.openWorkSession();
  await page.getByRole("button", {name: /^Worked for/}).click();
  const group = page.getByRole("button", {name: "Ran 60 commands", exact: true});
  await group.click();
  await group.focus();
  for (let index = 0; index < 60; index += 1) {
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", {name: `Ran echo recorded-work-${index}`, exact: true})).toBeFocused();
  }
});

test("scrolling expanded work keeps mounted sibling rows separated", async ({page, timeline}) => {
  await timeline.openWorkSession();
  const viewport = page.getByLabel("Session timeline");
  await page.getByRole("button", {name: /^Worked for/}).click();
  await page.getByRole("button", {name: "Ran 60 commands", exact: true}).click();
  await viewport.focus();
  const observation = viewport.evaluate(
    (element) =>
      new Promise<{samples: number; overlaps: number[]; peak: number}>((resolve) => {
        let samples = 0;
        let peak = 0;
        const overlaps: number[] = [];
        const observer = new ResizeObserver(() => {
          samples += 1;
          const bounds = element.getBoundingClientRect();
          const lists = [...element.querySelectorAll<HTMLElement>("[data-work-list]")];
          peak = Math.max(peak, element.querySelectorAll("[data-work-index]").length);
          for (const list of lists) {
            const rows = [...list.children].map((row) => row.getBoundingClientRect());
            for (const [index, row] of rows.entries()) {
              for (const next of rows.slice(index + 1)) {
                const overlap = Math.min(row.bottom, next.bottom, bounds.bottom) - Math.max(row.top, next.top, bounds.top);
                if (overlap > 1) overlaps.push(overlap);
              }
            }
          }
        });
        const observe = () => {
          for (const list of element.querySelectorAll("[data-work-list], [data-timeline-virtual-content]")) observer.observe(list);
        };
        const mutations = new MutationObserver(observe);
        mutations.observe(element, {childList: true, subtree: true});
        observe();
        element.addEventListener(
          "stop-work-probe",
          () => {
            observer.disconnect();
            mutations.disconnect();
            resolve({samples, overlaps, peak});
          },
          {once: true}
        );
        element.setAttribute("data-work-probe-ready", "true");
      })
  );
  await expect(viewport).toHaveAttribute("data-work-probe-ready", "true");
  await viewport.hover();
  for (let gesture = 0; gesture < 30; gesture += 1) {
    await page.mouse.wheel(0, 600);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await expect(page.getByText("The recorded work is complete.", {exact: true})).toBeInViewport();
  for (let gesture = 0; gesture < 30; gesture += 1) {
    await page.mouse.wheel(0, -600);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  }
  await expect(page.getByRole("button", {name: "Ran 60 commands", exact: true})).toBeInViewport();
  await viewport.dispatchEvent("stop-work-probe");
  const result = await observation;
  expect(result.samples).toBeGreaterThan(5);
  expect(result.peak).toBeLessThan(65);
  expect(result.overlaps).toEqual([]);
});

test("sending after inspecting work restores pinning and stream following", async ({page, timeline}) => {
  await timeline.openWorkSession();
  await page.getByRole("button", {name: /^Worked for/}).click();
  await page.getByRole("button", {name: "Ran 60 commands", exact: true}).click();
  const prompt = "Continue after inspecting historical work";
  await timeline.sendMessage(prompt, {awaitBottom: false});
  await expect.poll(() => timeline.messageViewportTop(prompt)).toBeGreaterThanOrEqual(23);
  await expect.poll(() => timeline.messageViewportTop(prompt)).toBeLessThanOrEqual(25);
  await timeline.waitForLineGrowth(40);
  await timeline.expectAtBottom();
  await timeline.completeMessage();
  await timeline.expectAtBottom();
});

test("work expansion respects reduced motion", async ({page, timeline}) => {
  await page.emulateMedia({reducedMotion: "reduce"});
  await timeline.openWorkSession();
  const turn = page.getByRole("button", {name: /^Worked for/});
  const body = turn.locator("xpath=following-sibling::div");
  await turn.click();
  await expect(page.getByRole("button", {name: "Ran 60 commands", exact: true})).toBeVisible();
  expect(await body.evaluate((element) => element.getAnimations().length)).toBe(0);

  await turn.click();
  await expect(page.getByRole("button", {includeHidden: true, name: "Ran 60 commands", exact: true})).toHaveCount(0);
  expect(await body.evaluate((element) => element.getAnimations().length)).toBe(0);
});
