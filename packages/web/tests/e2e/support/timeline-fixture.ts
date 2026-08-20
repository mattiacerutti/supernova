import {expect, test as base} from "@playwright/test";
import type {Page} from "@playwright/test";
import {
  EMPTY_SESSION_ID,
  EMPTY_SESSION_TITLE,
  OTHER_SESSION_TITLE,
  timelineStreamLine,
  TIMELINE_PROJECT_NAME,
  TIMELINE_PROJECT_PATH,
  TIMELINE_SESSION_ID,
  TIMELINE_SESSION_TITLE,
} from "@e2e/mocks/timeline-data";
import {installTimelineVisualProbe} from "@e2e/support/install-visual-probe";
import type {TimelineMockState, TimelineVisualSample} from "@e2e/support/timeline-test-api";

export const BOTTOM_TOLERANCE_PX = 5;
export const DETACHED_DISTANCE_PX = 40;

export interface VisibleTextAnchor {
  readonly elementTop: number;
  readonly scrollTop: number;
  readonly text: string;
}

/** Drives real timeline interactions while exposing browser geometry observations. */
export class TimelineDriver {
  public constructor(private readonly page: Page) {}

  /** Installs deterministic browser state and the frame probe before application code runs. */
  public async initialize(): Promise<void> {
    await this.page.addInitScript(installTimelineVisualProbe);
    await this.page.addInitScript(
      ({projectName, projectPath}) => {
        const projectId = btoa(encodeURIComponent(projectPath)).replaceAll("=", "");
        localStorage.setItem(
          "supernova-projects",
          JSON.stringify({
            state: {
              projects: [{addedAt: "2026-01-01T00:00:00.000Z", id: projectId, name: projectName, path: projectPath, pinned: false, pinnedSessionIds: []}],
            },
            version: 0,
          })
        );
        localStorage.setItem(
          "supernova-sidebar-sections",
          JSON.stringify({
            state: {expandedProjects: [projectId], isPinnedCollapsed: false, isProjectsCollapsed: false, sidebarWidth: 288},
            version: 0,
          })
        );
      },
      {projectName: TIMELINE_PROJECT_NAME, projectPath: TIMELINE_PROJECT_PATH}
    );
  }

  /** Opens the primary long session and waits for its timeline to become visible. */
  public async openMainSession(): Promise<void> {
    await this.openSession(TIMELINE_SESSION_ID, TIMELINE_SESSION_TITLE);
  }

  /** Creates an empty session and sends its first message through the new-session screen. */
  public async startEmptySession(): Promise<void> {
    const projectId = Buffer.from(encodeURIComponent(TIMELINE_PROJECT_PATH)).toString("base64").replaceAll("=", "");
    await this.page.goto(`/session/new?projectId=${projectId}`, {waitUntil: "commit"});
    await this.sendMessage();
    await expect(this.page).toHaveURL(`/session/${EMPTY_SESSION_ID}`);
    await expect(this.page.getByRole("heading", {name: EMPTY_SESSION_TITLE})).toBeVisible();
  }

  /** Navigates through the real sidebar to the second long session. */
  public async switchToOtherSession(): Promise<void> {
    await this.switchToSession(OTHER_SESSION_TITLE);
  }

  /** Navigates through the real sidebar to the primary streaming session. */
  public async switchToMainSession(): Promise<void> {
    await this.switchToSession(TIMELINE_SESSION_TITLE);
  }

  /** Sends a message through the real contenteditable composer. */
  public async sendMessage(text = "Exercise the timeline under a very fast multiline response"): Promise<void> {
    const editor = this.page.locator('[contenteditable="true"]').first();
    await expect(editor).toBeEditable();
    await editor.fill(text);
    await this.page.getByRole("button", {name: "Send message"}).click();
    await expect(this.page.getByRole("button", {name: "Stop streaming"})).toBeVisible();
    await expect.poll(() => this.mockState().then((state) => state.status)).toBe("streaming");
    await this.expectAtBottom();
  }

  /** Asserts that the active status is mounted after, rather than inside, the virtual canvas. */
  public async expectStatusOutsideVirtualization(): Promise<void> {
    const footer = this.page.locator('[data-timeline-footer="streaming-status"]');
    await expect(footer).toBeVisible();
    await expect(this.page.locator('[data-timeline-virtual-content] [data-timeline-footer="streaming-status"]')).toHaveCount(0);
    expect(await footer.evaluate((element) => window.getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  }

  /** Runs /undo and waits for the committed transcript to remove one turn. */
  public async undoLatestWithSlashCommand(): Promise<void> {
    const before = await this.mockState();
    await this.runCheckpointSlashCommand("undo");
    await this.waitForCheckpoint({turnCount: before.turnCount - 1, undoneTurnCount: before.undoneTurnCount + 1});
    await expect(this.page.getByRole("button", {name: "Expand rolled back messages"})).toBeVisible();
  }

  /** Runs /redo and waits for the committed transcript to restore one turn. */
  public async redoLatestWithSlashCommand(): Promise<void> {
    const before = await this.mockState();
    await this.runCheckpointSlashCommand("redo");
    await this.waitForCheckpoint({turnCount: before.turnCount + 1, undoneTurnCount: before.undoneTurnCount - 1});
    await expect(this.page.getByRole("button", {name: "Expand rolled back messages"})).toBeHidden();
  }

  /** Reverts the latest visible user message through its timeline action. */
  public async revertLatestMessage(): Promise<void> {
    const before = await this.mockState();
    await this.page.getByRole("button", {name: "Revert to this message"}).last().click();
    await this.waitForCheckpoint({turnCount: before.turnCount - 1, undoneTurnCount: before.undoneTurnCount + 1});
    await expect(this.page.getByRole("button", {name: "Expand rolled back messages"})).toBeVisible();
  }

  /** Opens the rolled-back message drawer before a manual restore. */
  public async expandRolledBackMessages(): Promise<void> {
    await this.page.getByRole("button", {name: "Expand rolled back messages"}).click();
    await expect(this.page.getByRole("button", {name: "Restore rolled back message"})).toBeVisible();
  }

  /** Restores the latest rolled-back message through the drawer action. */
  public async restoreLatestMessage(): Promise<void> {
    const before = await this.mockState();
    await this.page.getByRole("button", {name: "Restore rolled back message"}).first().click();
    await this.waitForCheckpoint({turnCount: before.turnCount + 1, undoneTurnCount: before.undoneTurnCount - 1});
    await expect(this.page.getByRole("button", {name: "Expand rolled back messages"})).toBeHidden();
  }

  /** Stops the stream through the same composer control used by a person. */
  public async abortMessage(): Promise<void> {
    await this.page.getByRole("button", {name: "Stop streaming"}).click();
    await this.waitForSettledStatus("aborted");
  }

  /** Makes the mock server complete the current response naturally. */
  public async completeMessage(): Promise<void> {
    await this.page.evaluate(() => {
      if (!window.__supernovaTimelineMock) throw new Error("Timeline RPC mock is not installed");
      window.__supernovaTimelineMock.completeStream();
    });
    await this.waitForSettledStatus("completed");
  }

  /** Waits for a relative amount of mock stream growth rather than elapsed time. */
  public async waitForLineGrowth(additionalLines: number): Promise<void> {
    const initialLineCount = (await this.mockState()).lineCount;
    const targetLineCount = initialLineCount + additionalLines;
    await this.page.evaluate((lineCount) => {
      if (!window.__supernovaTimelineMock) throw new Error("Timeline RPC mock is not installed");
      window.__supernovaTimelineMock.emitLines(lineCount);
    }, additionalLines);
    await expect.poll(() => this.mockState().then((state) => state.lineCount)).toBe(targetLineCount);

    if (new URL(this.page.url()).pathname !== `/session/${TIMELINE_SESSION_ID}`) return;

    await expect(this.page.locator(".session-markdown").last()).toContainText(timelineStreamLine(targetLineCount));
    const renderedFrameCount = this.visibleFrameSamples(await this.visualSamples()).length;
    await expect.poll(async () => this.visibleFrameSamples(await this.visualSamples()).length).toBeGreaterThan(renderedFrameCount);
  }

  /** Clears all previously captured visual samples. */
  public async resetVisualProbe(): Promise<void> {
    await this.page.evaluate(() => {
      if (!window.__supernovaTimelineVisualProbe) throw new Error("Timeline visual probe is not installed");
      window.__supernovaTimelineVisualProbe.reset();
    });
  }

  /** Returns all geometry captured since the probe was last reset. */
  public async visualSamples(): Promise<readonly TimelineVisualSample[]> {
    return await this.page.evaluate(() => {
      if (!window.__supernovaTimelineVisualProbe) throw new Error("Timeline visual probe is not installed");
      return window.__supernovaTimelineVisualProbe.read();
    });
  }

  /** Records enough real frames and height changes to assess a growing stream. */
  public async recordStreamGrowth(additionalLines = 45): Promise<readonly TimelineVisualSample[]> {
    await this.resetVisualProbe();
    await this.waitForLineGrowth(additionalLines);
    await expect
      .poll(async () => this.visibleFrameSamples(await this.visualSamples()).length, {message: "timeline should render several sampled frames"})
      .toBeGreaterThanOrEqual(4);
    await expect
      .poll(async () => new Set((await this.visualSamples()).filter((sample) => sample.visible).map((sample) => sample.scrollHeight)).size, {
        message: "stream growth should change rendered timeline height",
      })
      .toBeGreaterThanOrEqual(2);
    return await this.visualSamples();
  }

  /** Scrolls a small amount upward and waits until the timeline is genuinely detached. */
  public async detachSlightly(): Promise<void> {
    const initialFrameCount = this.visibleFrameSamples(await this.visualSamples()).length;
    const initialScrollTop = await this.scrollTop();
    await this.timeline().hover();
    await this.page.mouse.wheel(0, -90);
    await this.waitForDurableDetachment({initialFrameCount, maximumScrollTop: initialScrollTop - 40, minimumDistance: DETACHED_DISTANCE_PX});
  }

  /** Scrolls far enough upward to leave room for incremental downward gestures. */
  public async detachFar(): Promise<void> {
    const initialFrameCount = this.visibleFrameSamples(await this.visualSamples()).length;
    const initialScrollTop = await this.scrollTop();
    await this.timeline().hover();
    await this.page.mouse.wheel(0, -600);
    await this.waitForDurableDetachment({initialFrameCount, maximumScrollTop: initialScrollTop - 300, minimumDistance: 300});
  }

  /** Applies a native downward wheel gesture over the timeline. */
  public async scrollDown(deltaY: number): Promise<void> {
    const initialFrameCount = this.visibleFrameSamples(await this.visualSamples()).length;
    await this.timeline().hover();
    await this.page.mouse.wheel(0, deltaY);
    await expect.poll(async () => this.visibleFrameSamples(await this.visualSamples()).length).toBeGreaterThan(initialFrameCount);
  }

  /** Applies a native upward wheel gesture over the timeline without asserting detachment. */
  public async scrollUp(deltaY: number): Promise<void> {
    await this.timeline().hover();
    await this.page.mouse.wheel(0, -deltaY);
  }

  /** Measures the newest rendered message containing the text, relative to the viewport top. */
  public async messageViewportTop(text: string): Promise<number> {
    return await this.page.evaluate((messageText) => {
      const viewport = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
      if (!viewport) throw new Error("Session timeline is not available");

      const matches = [...viewport.querySelectorAll<HTMLElement>("article")].filter((element) => element.textContent?.includes(messageText));
      const target = matches.at(-1);
      if (!target) throw new Error("The sent user message is not rendered");

      return target.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
    }, text);
  }

  /** Reads the current height of the lossy fake space below an anchored message. */
  public async fakeSpaceHeight(): Promise<number> {
    return await this.page.locator("[data-timeline-fake-space]").evaluate((element) => element.getBoundingClientRect().height);
  }

  /** Reaches the bottom through a native wheel gesture, without assigning scrollTop. */
  public async manuallyScrollToBottom(): Promise<void> {
    for (let gesture = 0; gesture < 40; gesture += 1) {
      if ((await this.bottomDistance()) <= BOTTOM_TOLERANCE_PX) break;
      await this.scrollDown(1_000);
    }
    await this.expectAtBottom();
  }

  /** Uses the product's scroll-to-latest control. */
  public async clickScrollToBottom(): Promise<void> {
    const button = this.page.getByRole("button", {name: "Scroll to latest message"}).and(this.page.locator('[data-active="true"]'));
    await expect(button).toBeVisible();
    await button.click();
    await this.expectAtBottom();
  }

  /** Asserts that native timeline geometry is at its latest content. */
  public async expectAtBottom(): Promise<void> {
    await expect.poll(() => this.bottomDistance(), {message: "timeline should be bottom-locked"}).toBeLessThanOrEqual(BOTTOM_TOLERANCE_PX);
  }

  /** Asserts a meaningful gap from the bottom rather than relying on button animation state. */
  public async expectDetached(): Promise<void> {
    await expect.poll(() => this.bottomDistance(), {message: "timeline should be detached from the bottom"}).toBeGreaterThanOrEqual(DETACHED_DISTANCE_PX);
  }

  /** Captures the assistant message nearest the middle of the viewport. */
  public async captureVisibleTextAnchor(): Promise<VisibleTextAnchor> {
    return await this.page.evaluate(() => {
      const viewport = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
      if (!viewport) throw new Error("Session timeline is not available");

      const viewportRect = viewport.getBoundingClientRect();
      const viewportCenter = viewportRect.top + viewportRect.height / 2;
      const candidates = [...document.querySelectorAll<HTMLElement>(".session-markdown")]
        .map((element) => ({element, rect: element.getBoundingClientRect()}))
        .filter(({rect}) => rect.bottom > viewportRect.top && rect.top < viewportRect.bottom)
        .toSorted((left, right) => Math.abs(left.rect.top + left.rect.height / 2 - viewportCenter) - Math.abs(right.rect.top + right.rect.height / 2 - viewportCenter));
      const anchor = candidates[0];
      if (!anchor?.element.textContent) throw new Error("No visible assistant text anchor was found");

      return {elementTop: anchor.rect.top, scrollTop: viewport.scrollTop, text: anchor.element.textContent};
    });
  }

  /** Measures a previously captured assistant message after the timeline changes. */
  public async measureVisibleTextAnchor(anchor: VisibleTextAnchor): Promise<VisibleTextAnchor> {
    return await this.page.evaluate((previous) => {
      const viewport = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
      if (!viewport) throw new Error("Session timeline is not available");

      const element = [...document.querySelectorAll<HTMLElement>(".session-markdown")].find((candidate) => candidate.textContent === previous.text);
      if (!element) throw new Error("The visible assistant text anchor is no longer rendered");

      return {elementTop: element.getBoundingClientRect().top, scrollTop: viewport.scrollTop, text: previous.text};
    }, anchor);
  }

  /** Reads native bottom distance directly from the scroll viewport. */
  public async bottomDistance(): Promise<number> {
    return await this.timeline().evaluate((viewport) => viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop);
  }

  /** Reports whether the timeline remains attached to its latest content. */
  public async isFollowing(): Promise<boolean> {
    return await this.timeline().evaluate((viewport) => !viewport.dataset.scrollable?.includes("end"));
  }

  /** Reports whether timeline content has grown beyond the viewport. */
  public async isScrollable(): Promise<boolean> {
    return await this.timeline().evaluate((viewport) => viewport.scrollHeight > viewport.clientHeight);
  }

  /** Reads native scrollHeight directly from the scroll viewport. */
  public async scrollHeight(): Promise<number> {
    return await this.timeline().evaluate((viewport) => viewport.scrollHeight);
  }

  /** Reads native scrollTop directly from the scroll viewport. */
  public async scrollTop(): Promise<number> {
    return await this.timeline().evaluate((viewport) => viewport.scrollTop);
  }

  /** Keeps only visible animation-frame samples for the primary timeline route. */
  public visibleFrameSamples(samples: readonly TimelineVisualSample[]): readonly TimelineVisualSample[] {
    return samples.filter((sample) => sample.source === "frame" && sample.visible && sample.pathname === `/session/${TIMELINE_SESSION_ID}`);
  }

  private timeline() {
    return this.page.getByLabel("Session timeline");
  }

  private async openSession(sessionId: string, title: string): Promise<void> {
    await this.page.goto(`/session/${sessionId}`, {waitUntil: "commit"});
    await expect(this.page.getByRole("heading", {name: title})).toBeVisible();
    await expect(this.timeline()).toBeVisible();
  }

  private async switchToSession(title: string): Promise<void> {
    await this.page.getByText(title, {exact: true}).click();
    await expect(this.page.getByRole("heading", {name: title})).toBeVisible();
    await expect(this.timeline()).toBeVisible();
  }

  /** Waits until a user scroll has remained detached across multiple painted frames. */
  private async waitForDurableDetachment(input: {readonly initialFrameCount: number; readonly maximumScrollTop: number; readonly minimumDistance: number}): Promise<void> {
    await expect
      .poll(
        async () => {
          const frames = this.visibleFrameSamples(await this.visualSamples()).slice(input.initialFrameCount);
          const detachedIndex = frames.findIndex((sample) => sample.bottomDistance >= input.minimumDistance && sample.scrollTop <= input.maximumScrollTop);
          if (detachedIndex < 0) return 0;

          const detachedFrames = frames.slice(detachedIndex);
          return detachedFrames.every((sample) => sample.bottomDistance >= input.minimumDistance && sample.scrollTop <= input.maximumScrollTop) ? detachedFrames.length : 0;
        },
        {message: "timeline should remain detached across painted frames"}
      )
      .toBeGreaterThanOrEqual(3);
  }

  private async runCheckpointSlashCommand(command: "redo" | "undo"): Promise<void> {
    const editor = this.page.locator('[contenteditable="true"]').first();
    await editor.fill(`/${command}`);
    await expect(this.page.getByRole("button", {name: new RegExp(`^${command}`, "i")})).toBeVisible();
    await editor.press("Enter");
  }

  private async waitForCheckpoint(expected: Pick<TimelineMockState, "turnCount" | "undoneTurnCount">): Promise<void> {
    await expect.poll(() => this.mockState().then((state) => state.turnCount)).toBe(expected.turnCount);
    await expect.poll(() => this.mockState().then((state) => state.undoneTurnCount)).toBe(expected.undoneTurnCount);
  }

  private async mockState(): Promise<TimelineMockState> {
    return await this.page.evaluate(() => {
      if (!window.__supernovaTimelineMock) throw new Error("Timeline RPC mock is not installed");
      return window.__supernovaTimelineMock.getState();
    });
  }

  private async waitForSettledStatus(status: "aborted" | "completed"): Promise<void> {
    await expect.poll(() => this.mockState().then((state) => state.status)).toBe(status);
    await expect(this.page.getByRole("button", {name: "Send message"})).toBeVisible();
    await expect(this.page.locator('[data-slot="message-scroller-content"]')).toHaveAttribute("aria-busy", "false");
  }
}

interface TimelineFixtures {
  readonly timeline: TimelineDriver;
}

export const test = base.extend<TimelineFixtures>({
  timeline: async ({page}, provide) => {
    const timeline = new TimelineDriver(page);
    await timeline.initialize();
    await provide(timeline);
  },
});

export {expect};
