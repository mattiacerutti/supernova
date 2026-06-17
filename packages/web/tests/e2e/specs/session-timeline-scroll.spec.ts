import {expect, test} from "@playwright/test";
import type {Page} from "@playwright/test";
import {sessionTimelineScenario, type SessionTimelineScenario} from "@e2e/scenarios/session-timeline";
import {configureE2eScenario} from "@e2e/support/configure-scenario";

interface E2eState {
  readonly lineCount: number;
}

interface TimelineState {
  readonly bottomDistance: number;
  readonly buttonVisible: boolean;
  readonly scrollTop: number;
  readonly visibleTexts: readonly string[];
}

const latestHistoryMessage = "User history turn 23";
const checkpointPreScrollTolerancePx = 8;
const commandToolScenario = sessionTimelineScenario().withCommandTool({outputLineCount: 120}).build();
const longHistoryScenario = sessionTimelineScenario().withHistoryTurnCount(80).build();
const streamingInteractionScenario = sessionTimelineScenario().withStream({lineCount: 500}).build();
const settlingIdMismatchScenario = sessionTimelineScenario().withStream({liveIdPrefix: "live-", settledIdPrefix: "settled-"}).build();

test.describe.configure({mode: "parallel"});

async function openSession(page: Page, scenario: SessionTimelineScenario = sessionTimelineScenario().build()): Promise<void> {
  await configureE2eScenario(page, scenario);
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

interface WheelTimelineDownGestureInput {
  readonly deltaY?: number;
  readonly steps?: number;
}

async function wheelCommandToolDetailsUpGesture(page: Page, initialNestedScrollTop = 420): Promise<{nestedScrollTop: number; timelineScrollTop: number}> {
  const panel = page.locator("[data-scrollable]").filter({hasText: "$ printf long output"}).first();
  await expect(panel).toBeVisible();

  await panel.evaluate((element, scrollTop) => {
    element.scrollTop = scrollTop;
  }, initialNestedScrollTop);

  const before = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll<HTMLElement>("[data-scrollable]")).find((element) => element.textContent?.includes("$ printf long output"));
    const timeline = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
    if (!panel || !timeline) throw new Error("Timeline or command details panel is missing");
    return {nestedScrollTop: Math.round(panel.scrollTop), timelineScrollTop: Math.round(timeline.scrollTop)};
  });

  const wheelPoint = await page.evaluate(() => {
    const panel = Array.from(document.querySelectorAll<HTMLElement>("[data-scrollable]")).find((element) => element.textContent?.includes("$ printf long output"));
    const timeline = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
    if (!panel || !timeline) throw new Error("Timeline or command details panel is missing");

    const panelRect = panel.getBoundingClientRect();
    const timelineRect = timeline.getBoundingClientRect();
    const top = Math.max(panelRect.top, timelineRect.top);
    const bottom = Math.min(panelRect.bottom, timelineRect.bottom);
    if (bottom <= top) throw new Error("Command details panel is outside the visible timeline viewport");

    return {
      x: panelRect.left + panelRect.width / 2,
      y: top + (bottom - top) / 2,
    };
  });

  await page.mouse.move(wheelPoint.x, wheelPoint.y);
  await page.mouse.wheel(0, -160);
  await waitForNextAnimationFrame(page);

  return before;
}

async function wheelTimelineDownGesture(page: Page, input: WheelTimelineDownGestureInput = {}): Promise<void> {
  const {deltaY = 240, steps = 10} = input;
  const timeline = page.getByLabel("Session timeline");
  const box = await timeline.boundingBox();
  if (!box) throw new Error("Session timeline is not visible");

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  for (let index = 0; index < steps; index += 1) {
    await page.mouse.wheel(0, deltaY);
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
    .poll(
      async () => {
        const [state, streamState] = await Promise.all([timelineState(page), e2eState(page)]);
        return streamState.lineCount > lineCountBeforeReattach && !state.buttonVisible && state.bottomDistance <= 100 ? state : null;
      },
      {timeout: 10_000}
    )
    .not.toBeNull();
}

function collectFlushSyncWarnings(page: Page): string[] {
  const messages: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("flushSync was called")) messages.push(message.text());
  });
  return messages;
}

async function expectSynchronousAutoFollowDuringStream(page: Page): Promise<void> {
  const result = await page.evaluate(
    (requiredGrowth) =>
      new Promise<{badSamples: Array<{bottomDistance: number; observedLineCount: number; scrollTop: number}>; observedGrowth: number}>((resolve) => {
        const read = () => {
          const scroller = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
          if (!scroller) return null;

          const text = Array.from(scroller.querySelectorAll<HTMLElement>("article"))
            .map((element) => element.textContent ?? "")
            .join(" ");
          const observedLineCount = text.match(/\b[a-z]\b/g)?.length ?? 0;

          return {
            bottomDistance: Math.round(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop),
            buttonVisible: document.querySelector('button[aria-label="Scroll to latest message"]') !== null,
            observedLineCount,
            scrollTop: Math.round(scroller.scrollTop),
          };
        };

        const initialLineCount = read()?.observedLineCount ?? 0;
        const targetLineCount = initialLineCount + requiredGrowth;
        const badSamples: Array<{bottomDistance: number; observedLineCount: number; scrollTop: number}> = [];
        const startedAt = performance.now();
        let lastObservedLineCount = initialLineCount;

        const tick = (): void => {
          const state = read();
          if (!state) {
            resolve({badSamples: [{bottomDistance: -1, observedLineCount: -1, scrollTop: -1}], observedGrowth: 0});
            return;
          }

          if (state.observedLineCount > lastObservedLineCount) {
            if (!state.buttonVisible && state.bottomDistance > 16) {
              badSamples.push({bottomDistance: state.bottomDistance, observedLineCount: state.observedLineCount, scrollTop: state.scrollTop});
            }
            lastObservedLineCount = state.observedLineCount;
          }

          if (state.observedLineCount >= targetLineCount || performance.now() - startedAt > 3_000) {
            resolve({badSamples, observedGrowth: state.observedLineCount - initialLineCount});
            return;
          }

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
    12
  );

  expect(result.observedGrowth).toBeGreaterThanOrEqual(12);
  expect(result.badSamples).toEqual([]);
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
  const buttonIndex = await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
    if (!scroller) return -1;

    const scrollerRect = scroller.getBoundingClientRect();
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-label="Revert to this message"]'));
    return buttons.findLastIndex((button) => {
      const rect = button.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom >= scrollerRect.top && rect.top <= scrollerRect.bottom;
    });
  });

  if (buttonIndex < 0) throw new Error("No visible revert button found in the timeline");
  await page.getByRole("button", {name: "Revert to this message"}).nth(buttonIndex).click();
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

interface CheckpointPreScrollInput {
  readonly beforeState: TimelineState;
  readonly mode: "removed" | "restored";
  readonly text: string;
}

async function expectCheckpointChangeBeforeDetachedScroll(page: Page, input: CheckpointPreScrollInput): Promise<void> {
  const result = await page.evaluate(
    ({beforeScrollTop, mode, text, tolerance}) =>
      new Promise<{ok: boolean; reason?: string; samples: Array<{changed: boolean; committed: boolean; movedDown: boolean; scrollTop: number}>}>((resolve) => {
        const startedAt = performance.now();
        const samples: Array<{changed: boolean; committed: boolean; movedDown: boolean; scrollTop: number}> = [];

        const latestCommitted = (): boolean => {
          const state = window.__supernovaE2E?.getState();
          if (!state) return false;
          return state.session.turns.some((turn) => turn.userMessage.contentParts.some((part) => part.type === "text" && part.text.includes(text)));
        };

        const tick = (): void => {
          const scroller = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
          if (!scroller) {
            resolve({ok: false, reason: "timeline missing", samples});
            return;
          }

          const committed = latestCommitted();
          const changed = mode === "removed" ? !committed : committed;
          const movedDown = scroller.scrollTop > beforeScrollTop + tolerance;
          samples.push({changed, committed, movedDown, scrollTop: Math.round(scroller.scrollTop)});

          if (movedDown && !changed) {
            resolve({ok: false, reason: "timeline scrolled down before the checkpoint changed", samples});
            return;
          }

          if (changed) {
            resolve({ok: true, samples});
            return;
          }

          if (performance.now() - startedAt > 5_000) {
            resolve({ok: false, reason: "checkpoint did not change", samples});
            return;
          }

          requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      }),
    {beforeScrollTop: input.beforeState.scrollTop, mode: input.mode, text: input.text, tolerance: checkpointPreScrollTolerancePx}
  );

  expect(result.ok, `${result.reason ?? "checkpoint order failed"}\n${JSON.stringify(result.samples.slice(-12), null, 2)}`).toBe(true);
}

async function expectMessageRemovedBeforeScroll(page: Page): Promise<void> {
  await expect.poll(() => latestHistoryMessageCommitted(page)).toBe(false);

  await waitForTimelineStable(page);
  const state = await timelineState(page);
  expect(await latestHistoryMessageCommitted(page)).toBe(false);
  expect(state.buttonVisible).toBe(false);
  expect(state.bottomDistance).toBeLessThanOrEqual(4);
}

async function expectMessageRestoredBeforeScroll(page: Page, input: {readonly text: string}): Promise<void> {
  const {text} = input;

  await expect.poll(() => latestHistoryMessageCommitted(page)).toBe(true);

  await waitForTimelineStable(page);
  const state = await timelineState(page);
  expect(await latestHistoryMessageCommitted(page)).toBe(true);
  expect(state.buttonVisible).toBe(false);
  expect(state.bottomDistance).toBeLessThanOrEqual(4);
  expect(state.visibleTexts.some((visibleText) => visibleText.includes(text))).toBe(true);
}

test.describe("session timeline scroll behavior", () => {
  test("opens long uncached sessions at the bottom", async ({page}) => {
    await configureE2eScenario(page, longHistoryScenario);
    await page.setViewportSize({height: 760, width: 1100});
    await page.goto("/session/e2e-session", {waitUntil: "commit"});

    const initialFrames = await page.evaluate(
      () =>
        new Promise<Array<{bottomDistance: number; buttonVisible: boolean}>>((resolve) => {
          const samples: Array<{bottomDistance: number; buttonVisible: boolean}> = [];
          let started = false;

          const start = (): void => {
            if (started) return;
            const scroller = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
            if (!scroller) return;

            started = true;
            let frame = 0;
            const tick = (): void => {
              samples.push({
                bottomDistance: Math.round(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop),
                buttonVisible: document.querySelector('button[aria-label="Scroll to latest message"]') !== null,
              });

              frame += 1;
              if (frame < 20) requestAnimationFrame(tick);
              else resolve(samples);
            };
            tick();
          };

          new MutationObserver(start).observe(document.documentElement, {childList: true, subtree: true});
          requestAnimationFrame(start);
        })
    );

    await expect(page.getByRole("heading", {name: "E2E timeline scroll"})).toBeVisible();
    await waitForTimelineStable(page);

    expect(initialFrames.some((frame) => frame.buttonVisible)).toBe(false);
    const state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(4);
    expect(state.visibleTexts.some((text) => text.includes("Assistant history turn 79"))).toBe(true);
  });

  test("/undo from the bottom removes the latest message before settling at the bottom", async ({page}) => {
    await openSession(page);

    await runSlashCommand(page, "undo");

    await expectMessageRemovedBeforeScroll(page);
  });

  test("/undo from a detached scroll position removes the latest message before scrolling to the bottom", async ({page}) => {
    await openSession(page);
    const beforeState = await scrollUpUntilDetached(page);

    const checkpointOrder = expectCheckpointChangeBeforeDetachedScroll(page, {beforeState, mode: "removed", text: latestHistoryMessage});
    await runSlashCommand(page, "undo");

    await checkpointOrder;
    await expectMessageRemovedBeforeScroll(page);
  });

  test("manual revert from the bottom removes the latest message before settling at the bottom", async ({page}) => {
    await openSession(page);

    await manuallyUndoLatestMessage(page);

    await expectMessageRemovedBeforeScroll(page);
  });

  test("manual revert from a detached scroll position removes the latest message before scrolling to the bottom", async ({page}) => {
    await openSession(page);
    const beforeState = await scrollUpUntilDetached(page);

    const checkpointOrder = expectCheckpointChangeBeforeDetachedScroll(page, {beforeState, mode: "removed", text: latestHistoryMessage});
    await manuallyUndoLatestMessage(page);

    await checkpointOrder;
    await expectMessageRemovedBeforeScroll(page);
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

    const checkpointOrder = expectCheckpointChangeBeforeDetachedScroll(page, {beforeState, mode: "restored", text: latestHistoryMessage});
    await runSlashCommand(page, "redo");

    await checkpointOrder;
    await expectMessageRestoredBeforeScroll(page, {text: latestHistoryMessage});
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

    const checkpointOrder = expectCheckpointChangeBeforeDetachedScroll(page, {beforeState, mode: "restored", text: latestHistoryMessage});
    await manuallyRestoreLatestMessage(page);

    await checkpointOrder;
    await expectMessageRestoredBeforeScroll(page, {text: latestHistoryMessage});
  });

  test("scrolling command tool details with the wheel does not detach the timeline", async ({page}) => {
    await openSession(page, commandToolScenario);

    const before = await wheelCommandToolDetailsUpGesture(page);

    await expect
      .poll(async () => {
        const state = await page.evaluate(() => {
          const panel = Array.from(document.querySelectorAll<HTMLElement>("[data-scrollable]")).find((element) => element.textContent?.includes("$ printf long output"));
          const timeline = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
          if (!panel || !timeline) throw new Error("Timeline or command details panel is missing");
          return {
            buttonVisible: document.querySelector('button[aria-label="Scroll to latest message"]') !== null,
            nestedScrollTop: Math.round(panel.scrollTop),
            timelineScrollTop: Math.round(timeline.scrollTop),
          };
        });

        if (state.nestedScrollTop < before.nestedScrollTop && Math.abs(state.timelineScrollTop - before.timelineScrollTop) <= 2 && !state.buttonVisible) return state;
        return null;
      })
      .not.toBeNull();
  });

  test("scrolling command tool details to the top with the wheel does not detach the timeline", async ({page}) => {
    await openSession(page, commandToolScenario);

    const before = await wheelCommandToolDetailsUpGesture(page, 40);

    await expect
      .poll(async () => {
        const state = await page.evaluate(() => {
          const panel = Array.from(document.querySelectorAll<HTMLElement>("[data-scrollable]")).find((element) => element.textContent?.includes("$ printf long output"));
          const timeline = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
          if (!panel || !timeline) throw new Error("Timeline or command details panel is missing");
          return {
            buttonVisible: document.querySelector('button[aria-label="Scroll to latest message"]') !== null,
            nestedScrollTop: Math.round(panel.scrollTop),
            timelineScrollTop: Math.round(timeline.scrollTop),
          };
        });

        if (state.nestedScrollTop < before.nestedScrollTop && Math.abs(state.timelineScrollTop - before.timelineScrollTop) <= 2 && !state.buttonVisible) return state;
        return null;
      })
      .not.toBeNull();
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

  test("streamed content stays bottom-locked in the same frame while auto-following", async ({page}) => {
    const flushSyncWarnings = collectFlushSyncWarnings(page);
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    await expectSynchronousAutoFollowDuringStream(page);
    expect(flushSyncWarnings).toEqual([]);
  });

  test("scrolling slightly up during streaming detaches from auto-scroll", async ({page}) => {
    await openSession(page, streamingInteractionScenario);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    const timeline = page.getByLabel("Session timeline");
    const box = await timeline.boundingBox();
    if (!box) throw new Error("Session timeline is not visible");

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -80);
    await waitForNextAnimationFrame(page);
    const detachedLineCount = await e2eState(page).then((state) => state.lineCount);

    await expect
      .poll(async () => {
        const [nextTimelineState, nextE2eState] = await Promise.all([timelineState(page), e2eState(page)]);
        return nextE2eState.lineCount >= detachedLineCount + 5 && nextTimelineState.buttonVisible && nextTimelineState.bottomDistance > 4 ? nextTimelineState : null;
      })
      .not.toBeNull();
  });

  test("scrolling up during streaming detaches from auto-scroll and shows the scroll-to-bottom button", async ({page}) => {
    await openSession(page, streamingInteractionScenario);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);

    const state = await scrollUpUntilDetachedDuringStream(page);
    expect(state.buttonVisible).toBe(true);
    expect(state.bottomDistance).toBeGreaterThan(100);
  });

  test("switching away and back while auto-following a stream keeps auto-follow enabled", async ({page}) => {
    await openSession(page, streamingInteractionScenario);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    const lineCountBeforeSwitch = await e2eState(page).then((state) => state.lineCount);

    await page.evaluate(() => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByText("Select a session or start a new one.")).toBeVisible();
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(lineCountBeforeSwitch + 10);

    await page.evaluate(() => {
      window.history.pushState(null, "", "/session/e2e-session");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", {name: "E2E timeline scroll"})).toBeVisible();
    const lineCountAfterReturn = await e2eState(page).then((state) => state.lineCount);

    await expectReattachedDuringStream(page, lineCountAfterReturn);
  });

  test("clicking scroll to bottom while detached during streaming reattaches to auto-scroll", async ({page}) => {
    await openSession(page, streamingInteractionScenario);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await scrollUpUntilDetachedDuringStream(page);
    const lineCountBeforeReattach = await e2eState(page).then((state) => state.lineCount);

    await page.getByRole("button", {name: "Scroll to latest message"}).click();

    await expectReattachedDuringStream(page, lineCountBeforeReattach);
  });

  test("manual scrolling to the bottom while detached during streaming reattaches to auto-scroll", async ({page}) => {
    await openSession(page, streamingInteractionScenario);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await scrollUpUntilDetachedDuringStream(page);
    const lineCountBeforeReattach = await e2eState(page).then((state) => state.lineCount);

    await wheelTimelineDownGesture(page, {steps: 30});

    await expectReattachedDuringStream(page, lineCountBeforeReattach);
  });

  test("scrolling down after reattaching during streaming remains attached", async ({page}) => {
    await openSession(page, streamingInteractionScenario);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await scrollUpUntilDetachedDuringStream(page);
    const lineCountBeforeReattach = await e2eState(page).then((state) => state.lineCount);

    await wheelTimelineDownGesture(page, {steps: 30});
    await expectReattachedDuringStream(page, lineCountBeforeReattach);

    const lineCountBeforeIgnoredScroll = await e2eState(page).then((state) => state.lineCount);
    await wheelTimelineDownGesture(page, {deltaY: 720, steps: 20});

    await expect
      .poll(async () => {
        const [state, streamState] = await Promise.all([timelineState(page), e2eState(page)]);
        return streamState.lineCount >= lineCountBeforeIgnoredScroll + 5 && !state.buttonVisible && state.bottomDistance <= 100 ? state : null;
      })
      .not.toBeNull();

    const state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(100);
  });

  test("scrolling down while detached during streaming stays detached until the bottom is reached", async ({page}) => {
    await openSession(page, streamingInteractionScenario);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await scrollUpUntilDetachedDuringStream(page);

    for (let index = 0; index < 4; index += 1) {
      await wheelTimelineUpGesture(page);
    }

    await expect
      .poll(async () => {
        const state = await timelineState(page);
        return state.buttonVisible && state.bottomDistance > 2_400 ? state.bottomDistance : 0;
      })
      .toBeGreaterThan(2_400);

    const beforeState = await timelineState(page);
    await wheelTimelineDownGesture(page, {steps: 5});

    await expect
      .poll(async () => {
        const state = await timelineState(page);
        return state.scrollTop > beforeState.scrollTop + 200 && state.buttonVisible && state.bottomDistance > 600 ? state.scrollTop : 0;
      })
      .toBeGreaterThan(beforeState.scrollTop + 200);

    const afterScrollState = await timelineState(page);
    expect(afterScrollState.buttonVisible).toBe(true);
    expect(afterScrollState.bottomDistance).toBeGreaterThan(600);

    const lineCountAfterScroll = await e2eState(page).then((state) => state.lineCount);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(lineCountAfterScroll + 5);

    const settledState = await timelineState(page);
    expect(settledState.buttonVisible).toBe(true);
    expect(settledState.bottomDistance).toBeGreaterThan(100);
    expect(settledState.scrollTop).toBeGreaterThanOrEqual(afterScrollState.scrollTop - 8);
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

  test("restores the bottom cache after an auto-followed stream completes", async ({page}) => {
    test.setTimeout(15_000);
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await waitForStreamToComplete(page);

    await page.evaluate(() => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByText("Select a session or start a new one.")).toBeVisible();

    await page.evaluate(() => {
      window.history.pushState(null, "", "/session/e2e-session");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", {name: "E2E timeline scroll"})).toBeVisible();
    await waitForTimelineStable(page);

    const state = await timelineState(page);
    expect(state.buttonVisible).toBe(false);
    expect(state.bottomDistance).toBeLessThanOrEqual(4);
    expect(state.visibleTexts.some((text) => text.includes("Assistant streamed response"))).toBe(true);
  });

  test("restores a detached cache after an auto-followed stream completes", async ({page}) => {
    test.setTimeout(15_000);
    await openSession(page);

    await submitMessage(page);
    await expect.poll(() => e2eState(page).then((state) => state.lineCount)).toBeGreaterThanOrEqual(25);
    await waitForStreamToComplete(page);

    await wheelTimelineUpGesture(page);
    await waitForTimelineStable(page);
    const beforeState = await timelineState(page);
    expect(beforeState.buttonVisible).toBe(true);
    expect(beforeState.bottomDistance).toBeGreaterThan(50);

    await page.evaluate(() => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByText("Select a session or start a new one.")).toBeVisible();

    await page.evaluate(() => {
      window.history.pushState(null, "", "/session/e2e-session");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", {name: "E2E timeline scroll"})).toBeVisible();
    await waitForTimelineStable(page);

    const restoredState = await timelineState(page);
    expect(restoredState.buttonVisible).toBe(true);
    expect(Math.abs(restoredState.bottomDistance - beforeState.bottomDistance)).toBeLessThanOrEqual(8);
    expect(Math.abs(restoredState.scrollTop - beforeState.scrollTop)).toBeLessThanOrEqual(8);
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
    await openSession(page, settlingIdMismatchScenario);

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
    expect(Math.abs(state.scrollTop - detachedState.scrollTop)).toBeLessThanOrEqual(8);
  });

  test("long-lived message aborts while detached and keeps the same content visible without scrolling", async ({page}) => {
    test.setTimeout(15_000);
    await openSession(page, settlingIdMismatchScenario);

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
    expect(Math.abs(state.scrollTop - detachedState.scrollTop)).toBeLessThanOrEqual(8);
  });
});
