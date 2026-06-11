import {expect, test} from "@playwright/test";
import type {Page} from "@playwright/test";
import {sessionTimelineScenario} from "@e2e/scenarios/session-timeline";
import {configureE2eScenario} from "@e2e/support/configure-scenario";

interface E2eState {
  readonly lineCount: number;
}

interface TimelineState {
  readonly bottomDistance: number;
  readonly buttonVisible: boolean;
  readonly scrollTop: number;
  readonly topVisibleText: string | null;
  readonly visibleTexts: readonly string[];
}

const latestHistoryMessage = "User history turn 23";

test.describe.configure({mode: "parallel"});

async function openSession(page: Page): Promise<void> {
  await configureE2eScenario(page, sessionTimelineScenario().build());
  await page.setViewportSize({height: 760, width: 1100});
  await page.goto("/session/e2e-session");
  await expect(page.getByRole("heading", {name: "E2E timeline scroll"})).toBeVisible();
  await expect(page.getByRole("button", {name: "Send message"})).toBeVisible();
  await waitForTimelineStable(page);
}

async function waitForTimelineStable(page: Page, stableFrames = 12): Promise<void> {
  await page.waitForFunction(
    (requiredStableFrames) =>
      new Promise<boolean>((resolve) => {
        const read = () => {
          const scroller = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
          if (!scroller) return "";

          const scrollerRect = scroller.getBoundingClientRect();
          const visibleTexts = Array.from(scroller.querySelectorAll<HTMLElement>("article"))
            .filter((element) => {
              const rect = element.getBoundingClientRect();
              return rect.bottom >= scrollerRect.top && rect.top <= scrollerRect.bottom;
            })
            .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
            .filter(Boolean);

          return JSON.stringify({
            buttonVisible: document.querySelector('button[aria-label="Scroll to latest message"]') !== null,
            height: Math.round(scroller.scrollHeight),
            top: Math.round(scroller.scrollTop),
            visibleTexts,
          });
        };

        let lastSignature = "";
        let stableFrameCount = 0;

        const tick = () => {
          const signature = read();
          if (signature.length > 0 && signature === lastSignature) stableFrameCount += 1;
          else {
            lastSignature = signature;
            stableFrameCount = 0;
          }

          if (stableFrameCount >= requiredStableFrames) {
            resolve(true);
            return;
          }

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
    stableFrames
  );
}

async function e2eState(page: Page): Promise<E2eState> {
  return page.evaluate(() => {
    const state = window.__supernovaE2E?.getState();
    if (!state) throw new Error("E2E controller is not available");
    return {lineCount: state.lineCount};
  });
}

async function latestHistoryMessageCommitted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const state = window.__supernovaE2E?.getState();
    if (!state) throw new Error("E2E controller is not available");
    return state.session.turns.some((turn) => turn.userMessage.contentParts.some((part) => part.type === "text" && part.text.includes("User history turn 23")));
  });
}

async function timelineState(page: Page): Promise<TimelineState> {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
    if (!scroller) throw new Error("Session timeline is not available");

    const scrollerRect = scroller.getBoundingClientRect();
    const visibleTexts = Array.from(scroller.querySelectorAll<HTMLElement>("article"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.bottom >= scrollerRect.top && rect.top <= scrollerRect.bottom;
      })
      .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
      .filter(Boolean);

    return {
      bottomDistance: Math.round(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop),
      buttonVisible: document.querySelector('button[aria-label="Scroll to latest message"]') !== null,
      scrollTop: Math.round(scroller.scrollTop),
      topVisibleText: visibleTexts[0] ?? null,
      visibleTexts,
    };
  });
}

async function waitForNextAnimationFrame(page: Page): Promise<void> {
  await page.waitForFunction(() => new Promise((resolve) => requestAnimationFrame(() => resolve(true))));
}

async function wheelTimelineUpGesture(page: Page): Promise<void> {
  const timeline = page.getByLabel("Session timeline");
  const box = await timeline.boundingBox();
  if (!box) throw new Error("Session timeline is not visible");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // Model one deliberate physical wheel/trackpad gesture over multiple frames instead of
  // retrying independent wheel bursts until the UI happens to detach.
  for (let index = 0; index < 8; index += 1) {
    await page.mouse.wheel(0, -140);
    await waitForNextAnimationFrame(page);
  }
}

async function wheelTimelineDownGesture(page: Page): Promise<void> {
  const timeline = page.getByLabel("Session timeline");
  const box = await timeline.boundingBox();
  if (!box) throw new Error("Session timeline is not visible");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  for (let index = 0; index < 10; index += 1) {
    await page.mouse.wheel(0, 240);
    await waitForNextAnimationFrame(page);
  }
}

async function scrollUpUntilDetached(page: Page): Promise<TimelineState> {
  await wheelTimelineUpGesture(page);

  await expect
    .poll(async () => {
      const state = await timelineState(page);
      return state.buttonVisible && state.bottomDistance > 100 ? state : null;
    })
    .not.toBeNull();

  const state = await timelineState(page);
  expect(state.topVisibleText).not.toBeNull();
  return state;
}

async function scrollUpUntilDetachedDuringStream(page: Page): Promise<TimelineState> {
  const detachedState = await scrollUpUntilDetached(page);
  const detachedLineCount = await e2eState(page).then((state) => state.lineCount);

  await expect
    .poll(async () => {
      const [nextTimelineState, nextE2eState] = await Promise.all([timelineState(page), e2eState(page)]);
      return nextE2eState.lineCount >= detachedLineCount + 10 && nextTimelineState.buttonVisible && nextTimelineState.bottomDistance > 100 ? nextTimelineState : null;
    })
    .not.toBeNull();

  return detachedState;
}

async function submitMessage(page: Page): Promise<void> {
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Please stream a long response.");
  await page.getByRole("button", {name: "Send message"}).click();
}

async function stopStreaming(page: Page): Promise<void> {
  await page.getByRole("button", {name: "Stop streaming"}).click();
  await expect(page.getByRole("button", {name: "Send message"})).toBeVisible({timeout: 10_000});
}

async function expectReattachedDuringStream(page: Page, lineCountBeforeReattach: number): Promise<void> {
  await expect
    .poll(async () => {
      const [state, streamState] = await Promise.all([timelineState(page), e2eState(page)]);
      return streamState.lineCount > lineCountBeforeReattach && !state.buttonVisible && state.bottomDistance <= 100 ? state : null;
    })
    .not.toBeNull();
}

async function waitForStreamToComplete(page: Page): Promise<void> {
  await expect(page.getByRole("button", {name: "Send message"})).toBeVisible({timeout: 10_000});
  await waitForTimelineStable(page, 30);
}

async function runSlashCommand(page: Page, command: "redo" | "undo"): Promise<void> {
  await page.locator(".ProseMirror").click();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(`/${command}`);
  await page
    .getByRole("button", {name: new RegExp(command, "i")})
    .first()
    .click();
}

async function manuallyUndoLatestMessage(page: Page): Promise<void> {
  await page.getByRole("button", {name: "Revert to this message"}).last().click();
}

async function manuallyRestoreLatestMessage(page: Page): Promise<void> {
  await page.getByRole("button", {name: "Expand rolled back messages"}).click();
  await page.getByRole("button", {name: "Restore rolled back message"}).click();
}

async function prepareRedoState(page: Page): Promise<void> {
  await runSlashCommand(page, "undo");
  await expectMessageRemovedBeforeScroll(page);
  await waitForTimelineStable(page);
}

async function expectMessageRemovedBeforeScroll(page: Page, input: {readonly beforeState?: TimelineState} = {}): Promise<void> {
  const {beforeState} = input;

  await expect
    .poll(async () => {
      const [state, committed] = await Promise.all([timelineState(page), latestHistoryMessageCommitted(page)]);
      const removed = !committed;
      const scrollNotMovedYet = !beforeState || state.scrollTop === beforeState.scrollTop;
      return removed && scrollNotMovedYet ? state : null;
    })
    .not.toBeNull();

  await waitForTimelineStable(page);
  const state = await timelineState(page);
  expect(await latestHistoryMessageCommitted(page)).toBe(false);
  expect(state.buttonVisible).toBe(false);
  expect(state.bottomDistance).toBeLessThanOrEqual(4);
}

async function expectMessageRestoredBeforeScroll(page: Page, input: {readonly beforeState?: TimelineState; readonly text: string}): Promise<void> {
  const {beforeState, text} = input;

  await expect
    .poll(async () => {
      const [state, committed] = await Promise.all([timelineState(page), latestHistoryMessageCommitted(page)]);
      const restored = committed;
      const scrollNotMovedYet = !beforeState || state.scrollTop === beforeState.scrollTop;
      return restored && scrollNotMovedYet ? state : null;
    })
    .not.toBeNull();

  await waitForTimelineStable(page);
  const state = await timelineState(page);
  expect(await latestHistoryMessageCommitted(page)).toBe(true);
  expect(state.buttonVisible).toBe(false);
  expect(state.bottomDistance).toBeLessThanOrEqual(4);
  expect(state.visibleTexts.some((visibleText) => visibleText.includes(text))).toBe(true);
}

test.describe("session timeline scroll behavior", () => {
  test("/undo from the bottom removes the latest message before settling at the bottom", async ({page}) => {
    await openSession(page);

    await runSlashCommand(page, "undo");

    await expectMessageRemovedBeforeScroll(page);
  });

  test("/undo from a detached scroll position removes the latest message before scrolling to the bottom", async ({page}) => {
    await openSession(page);
    const beforeState = await scrollUpUntilDetached(page);

    await runSlashCommand(page, "undo");

    await expectMessageRemovedBeforeScroll(page, {beforeState});
  });

  test("manual revert from the bottom removes the latest message before settling at the bottom", async ({page}) => {
    await openSession(page);

    await manuallyUndoLatestMessage(page);

    await expectMessageRemovedBeforeScroll(page);
  });

  test("manual revert from a detached scroll position removes the latest message before scrolling to the bottom", async ({page}) => {
    await openSession(page);
    const beforeState = await scrollUpUntilDetached(page);

    await manuallyUndoLatestMessage(page);

    await expectMessageRemovedBeforeScroll(page, {beforeState});
  });

  test("/redo from the bottom restores the latest message before settling at the bottom", async ({page}) => {
    await openSession(page);
    await prepareRedoState(page);

    await runSlashCommand(page, "redo");

    await expectMessageRestoredBeforeScroll(page, {text: latestHistoryMessage});
  });

  test("/redo from a detached scroll position restores the latest message before scrolling to the bottom", async ({page}) => {
    await openSession(page);
    await prepareRedoState(page);
    const beforeState = await scrollUpUntilDetached(page);

    await runSlashCommand(page, "redo");

    await expectMessageRestoredBeforeScroll(page, {beforeState, text: latestHistoryMessage});
  });

  test("manual restore from the bottom restores the latest message before settling at the bottom", async ({page}) => {
    await openSession(page);
    await prepareRedoState(page);

    await manuallyRestoreLatestMessage(page);

    await expectMessageRestoredBeforeScroll(page, {text: latestHistoryMessage});
  });

  test("manual restore from a detached scroll position restores the latest message before scrolling to the bottom", async ({page}) => {
    await openSession(page);
    await prepareRedoState(page);
    const beforeState = await scrollUpUntilDetached(page);

    await manuallyRestoreLatestMessage(page);

    await expectMessageRestoredBeforeScroll(page, {beforeState, text: latestHistoryMessage});
  });

  test("sending a message from the bottom auto-scrolls while streaming", async ({page}) => {
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    const state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(100);
    expect(state.visibleTexts.some((text) => text.includes("Assistant streamed response"))).toBe(true);
  });

  test("scrolling up during streaming detaches from auto-scroll and shows the scroll-to-bottom button", async ({page}) => {
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    const state = await scrollUpUntilDetachedDuringStream(page);
    expect(state.buttonVisible).toBe(true);
    expect(state.bottomDistance).toBeGreaterThan(100);
  });

  test("clicking scroll to bottom while detached during streaming reattaches to auto-scroll", async ({page}) => {
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await scrollUpUntilDetachedDuringStream(page);
    const lineCountBeforeReattach = await e2eState(page).then((state) => state.lineCount);

    await page.getByRole("button", {name: "Scroll to latest message"}).click();

    await expectReattachedDuringStream(page, lineCountBeforeReattach);
  });

  test("manual scrolling to the bottom while detached during streaming reattaches to auto-scroll", async ({page}) => {
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await scrollUpUntilDetachedDuringStream(page);
    const lineCountBeforeReattach = await e2eState(page).then((state) => state.lineCount);

    await wheelTimelineDownGesture(page);

    await expectReattachedDuringStream(page, lineCountBeforeReattach);
  });

  test("sending a message from a detached scroll position scrolls to the bottom and reattaches", async ({page}) => {
    await openSession(page);
    await scrollUpUntilDetached(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(1);
    await waitForTimelineStable(page);

    const state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(4);
    expect(state.visibleTexts.some((text) => text.includes("Assistant streamed response"))).toBe(true);
  });

  test("long-lived message completes while following and stays at the bottom", async ({page}) => {
    test.setTimeout(15_000);
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    let state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(100);

    await waitForStreamToComplete(page);

    state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(4);
    expect(state.visibleTexts.some((text) => text.includes("Assistant streamed response"))).toBe(true);
  });

  test("long-lived message aborts while following and stays at the bottom", async ({page}) => {
    test.setTimeout(15_000);
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    let state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(100);

    await stopStreaming(page);
    await waitForTimelineStable(page, 30);

    state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(4);
    expect(state.visibleTexts.some((text) => text.includes("Assistant streamed response"))).toBe(true);
  });

  test("long-lived message completes while detached and keeps the same content visible without scrolling", async ({page}) => {
    test.setTimeout(15_000);
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    let state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(100);

    const detachedState = await scrollUpUntilDetachedDuringStream(page);
    await waitForStreamToComplete(page);

    state = await timelineState(page);
    expect(state.buttonVisible).toBe(true);
    expect(state.bottomDistance).toBeGreaterThan(100);
    expect(state.topVisibleText).toBe(detachedState.topVisibleText);
    expect(Math.abs(state.scrollTop - detachedState.scrollTop)).toBeLessThanOrEqual(8);
  });

  test("long-lived message aborts while detached and keeps the same content visible without scrolling", async ({page}) => {
    test.setTimeout(15_000);
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    let state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(100);

    const detachedState = await scrollUpUntilDetachedDuringStream(page);
    await stopStreaming(page);
    await waitForTimelineStable(page, 30);

    state = await timelineState(page);
    expect(state.buttonVisible).toBe(true);
    expect(state.bottomDistance).toBeGreaterThan(100);
    expect(state.topVisibleText).toBe(detachedState.topVisibleText);
    expect(Math.abs(state.scrollTop - detachedState.scrollTop)).toBeLessThanOrEqual(8);
  });
});
