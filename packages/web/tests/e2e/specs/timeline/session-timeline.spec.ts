import {BOTTOM_TOLERANCE_PX, DETACHED_DISTANCE_PX, expect, test} from "@e2e/support/timeline-fixture";
import type {TimelineDriver, VisibleTextAnchor} from "@e2e/support/timeline-fixture";
import type {TimelineVisualSample} from "@e2e/support/timeline-test-api";
import {EMPTY_SESSION_ID, OTHER_SESSION_ID, TIMELINE_SESSION_ID} from "@e2e/mocks/timeline-data";

function visibleSamples(samples: readonly TimelineVisualSample[], sessionId: string): readonly TimelineVisualSample[] {
  return samples.filter((sample) => sample.visible && sample.pathname === `/session/${sessionId}`);
}

function assertBottomLocked(input: {readonly minimumFrameCount?: number; readonly samples: readonly TimelineVisualSample[]; readonly sessionId?: string}): void {
  const {minimumFrameCount = 4, samples, sessionId = TIMELINE_SESSION_ID} = input;
  const visible = visibleSamples(samples, sessionId);
  const frames = visible.filter((sample) => sample.source === "frame");
  const violation = visible.find((sample) => sample.bottomDistance > BOTTOM_TOLERANCE_PX);

  expect(frames.length, "the browser should sample enough rendered frames").toBeGreaterThanOrEqual(minimumFrameCount);
  expect(violation, `bottom lock broke in a ${violation?.source ?? "unknown"} sample: ${JSON.stringify(violation)}`).toBeUndefined();
}

function assertSustainedDetachment(samples: readonly TimelineVisualSample[]): void {
  const frames = visibleSamples(samples, TIMELINE_SESSION_ID).filter((sample) => sample.source === "frame");
  const detachedIndex = frames.findIndex((sample) => sample.bottomDistance >= DETACHED_DISTANCE_PX);
  const detachedFrames = detachedIndex >= 0 ? frames.slice(detachedIndex) : [];
  const reattachedFrame = detachedFrames.find((sample) => sample.bottomDistance <= BOTTOM_TOLERANCE_PX);

  expect(detachedIndex, "at least one rendered frame should show the user's detached position").toBeGreaterThanOrEqual(0);
  expect(detachedFrames.length, "detachment must survive multiple later frames and stream updates").toBeGreaterThanOrEqual(6);
  expect(reattachedFrame, `timeline unexpectedly returned to the bottom: ${JSON.stringify(reattachedFrame)}`).toBeUndefined();
}

function assertAnchorUnmoved(before: VisibleTextAnchor, after: VisibleTextAnchor, samples: readonly TimelineVisualSample[]): void {
  const visible = visibleSamples(samples, TIMELINE_SESSION_ID);
  const scrollJump = visible.find((sample) => Math.abs(sample.scrollTop - before.scrollTop) > 1);

  expect(after.text, "the same transcript message should remain visible").toBe(before.text);
  expect(Math.abs(after.elementTop - before.elementTop), "the visible message should not move during settlement").toBeLessThanOrEqual(1);
  expect(Math.abs(after.scrollTop - before.scrollTop), "native scrollTop should remain stable during settlement").toBeLessThanOrEqual(1);
  expect(scrollJump, `a transient scroll jump was rendered during settlement: ${JSON.stringify(scrollJump)}`).toBeUndefined();
}

async function waitForPrimaryFrames(input: {readonly count?: number; readonly timeline: TimelineDriver}): Promise<readonly TimelineVisualSample[]> {
  const {count = 4, timeline} = input;
  await expect
    .poll(async () => timeline.visibleFrameSamples(await timeline.visualSamples()).length, {message: "timeline should render sampled frames"})
    .toBeGreaterThanOrEqual(count);
  return await timeline.visualSamples();
}

async function waitForCheckpointFrames(input: {
  readonly beforeScrollHeight: number;
  readonly direction: "grow" | "shrink";
  readonly timeline: TimelineDriver;
}): Promise<readonly TimelineVisualSample[]> {
  const {beforeScrollHeight, direction, timeline} = input;
  await expect
    .poll(async () => {
      const frames = timeline.visibleFrameSamples(await timeline.visualSamples());
      return frames.filter((sample) => (direction === "grow" ? sample.scrollHeight > beforeScrollHeight : sample.scrollHeight < beforeScrollHeight)).length;
    })
    .toBeGreaterThanOrEqual(2);
  return await timeline.visualSamples();
}

test.describe("session timeline visual stability", () => {
  test.beforeEach(async ({timeline}) => {
    await timeline.openMainSession();
  });

  test("opens long uncached sessions at the bottom", async ({timeline}) => {
    await timeline.expectAtBottom();
    assertBottomLocked({minimumFrameCount: 1, samples: await timeline.visualSamples()});

    await timeline.resetVisualProbe();
    await timeline.switchToOtherSession();
    await timeline.expectAtBottom();
    assertBottomLocked({minimumFrameCount: 1, samples: await timeline.visualSamples(), sessionId: OTHER_SESSION_ID});
  });

  test("keeps following when a new session first grows beyond the viewport", async ({timeline}) => {
    await timeline.startEmptySession();
    await timeline.expectStatusOutsideVirtualization();
    expect(await timeline.isScrollable(), "the initial response should still fit inside the viewport").toBe(false);
    await timeline.resetVisualProbe();

    await timeline.waitForLineGrowth(90);

    expect(await timeline.isScrollable(), "the growing response should overflow the viewport").toBe(true);
    expect(await timeline.isFollowing(), "the first overflow must not detach auto-follow").toBe(true);
    await timeline.expectAtBottom();
    assertBottomLocked({minimumFrameCount: 1, samples: await timeline.visualSamples(), sessionId: EMPTY_SESSION_ID});
  });

  test("sending a message from the bottom auto-scrolls while streaming", async ({timeline}) => {
    await timeline.expectAtBottom();
    await timeline.sendMessage();
    const firstScrollTop = await timeline.scrollTop();

    await timeline.waitForLineGrowth(60);
    await timeline.expectAtBottom();
    const secondScrollTop = await timeline.scrollTop();

    expect(secondScrollTop, "the viewport should advance with the growing response").toBeGreaterThan(firstScrollTop);
  });

  test("streamed content stays bottom-locked in the same frame while auto-following", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(30);

    const samples = await timeline.recordStreamGrowth(60);

    assertBottomLocked({samples});
  });

  test("scrolling slightly up during streaming detaches from auto-scroll", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(60);
    await timeline.resetVisualProbe();

    await timeline.detachSlightly();
    await timeline.waitForLineGrowth(90);
    const samples = await waitForPrimaryFrames({count: 8, timeline});

    assertSustainedDetachment(samples);
  });

  test("switching away and back while auto-following a stream keeps auto-follow enabled", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(45);
    await timeline.expectAtBottom();

    await timeline.switchToOtherSession();
    await timeline.waitForLineGrowth(60);
    await timeline.resetVisualProbe();
    await timeline.switchToMainSession();
    await timeline.expectAtBottom();
    assertBottomLocked({minimumFrameCount: 1, samples: await timeline.visualSamples()});

    assertBottomLocked({samples: await timeline.recordStreamGrowth(60)});
  });

  test("switching away and back opens a detached timeline at the bottom", async ({timeline}) => {
    await timeline.detachFar();
    await timeline.expectDetached();

    await timeline.switchToOtherSession();
    await timeline.resetVisualProbe();
    await timeline.switchToMainSession();
    await timeline.expectAtBottom();

    assertBottomLocked({minimumFrameCount: 1, samples: await timeline.visualSamples()});
  });

  test("clicking scroll to bottom while detached during streaming reattaches to auto-scroll", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(60);
    await timeline.detachSlightly();

    await timeline.clickScrollToBottom();

    assertBottomLocked({samples: await timeline.recordStreamGrowth(60)});
  });

  test("manual scrolling to the bottom while detached during streaming reattaches to auto-scroll", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(60);
    await timeline.detachFar();

    await timeline.manuallyScrollToBottom();

    assertBottomLocked({samples: await timeline.recordStreamGrowth(60)});
  });

  test("scrolling down after reattaching during streaming remains attached", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(60);
    await timeline.detachSlightly();
    await timeline.clickScrollToBottom();

    await timeline.scrollDown(120);

    assertBottomLocked({samples: await timeline.recordStreamGrowth(60)});
  });

  test("scrolling down while detached during streaming stays detached until the bottom is reached", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(75);
    await timeline.detachFar();
    const beforeScrollTop = await timeline.scrollTop();
    await timeline.resetVisualProbe();

    await timeline.scrollDown(90);
    await timeline.expectDetached();
    expect(await timeline.scrollTop(), "the downward wheel gesture should move the detached viewport").toBeGreaterThan(beforeScrollTop);
    await timeline.waitForLineGrowth(90);
    assertSustainedDetachment(await waitForPrimaryFrames({count: 8, timeline}));

    await timeline.manuallyScrollToBottom();
    assertBottomLocked({samples: await timeline.recordStreamGrowth(60)});
  });

  test("sending a message from a detached scroll position scrolls to the bottom and reattaches", async ({timeline}) => {
    await timeline.detachFar();

    await timeline.sendMessage();
    await timeline.waitForLineGrowth(45);
    await timeline.expectAtBottom();

    assertBottomLocked({samples: await timeline.recordStreamGrowth(60)});
  });

  test("/undo from the bottom removes the latest message and stays at the bottom in the same frame", async ({timeline}) => {
    await timeline.expectAtBottom();
    const beforeScrollHeight = await timeline.scrollHeight();
    await timeline.resetVisualProbe();

    await timeline.undoLatestWithSlashCommand();
    const samples = await waitForCheckpointFrames({beforeScrollHeight, direction: "shrink", timeline});

    assertBottomLocked({samples});
  });

  test("/undo from a detached position removes the latest message without moving visible content", async ({timeline}) => {
    await timeline.detachFar();
    const before = await timeline.captureVisibleTextAnchor();
    const beforeScrollHeight = await timeline.scrollHeight();
    await timeline.resetVisualProbe();

    await timeline.undoLatestWithSlashCommand();
    const samples = await waitForCheckpointFrames({beforeScrollHeight, direction: "shrink", timeline});
    const after = await timeline.measureVisibleTextAnchor(before);

    assertAnchorUnmoved(before, after, samples);
  });

  test("manual revert from the bottom removes the latest message and stays at the bottom", async ({timeline}) => {
    await timeline.expectAtBottom();
    const beforeScrollHeight = await timeline.scrollHeight();
    await timeline.resetVisualProbe();

    await timeline.revertLatestMessage();
    const samples = await waitForCheckpointFrames({beforeScrollHeight, direction: "shrink", timeline});

    assertBottomLocked({samples});
  });

  test("/redo from the bottom restores the latest message and stays at the bottom in the same frame", async ({timeline}) => {
    await timeline.undoLatestWithSlashCommand();
    await timeline.expectAtBottom();
    const beforeScrollHeight = await timeline.scrollHeight();
    await timeline.resetVisualProbe();

    await timeline.redoLatestWithSlashCommand();
    const samples = await waitForCheckpointFrames({beforeScrollHeight, direction: "grow", timeline});

    assertBottomLocked({samples});
  });

  test("/redo from a detached position restores the latest message without moving visible content", async ({timeline}) => {
    await timeline.undoLatestWithSlashCommand();
    await timeline.detachFar();
    const before = await timeline.captureVisibleTextAnchor();
    const beforeScrollHeight = await timeline.scrollHeight();
    await timeline.resetVisualProbe();

    await timeline.redoLatestWithSlashCommand();
    const samples = await waitForCheckpointFrames({beforeScrollHeight, direction: "grow", timeline});
    const after = await timeline.measureVisibleTextAnchor(before);

    assertAnchorUnmoved(before, after, samples);
  });

  test("manual restore from the bottom restores the latest message and stays at the bottom in the same frame", async ({timeline}) => {
    await timeline.undoLatestWithSlashCommand();
    await timeline.expandRolledBackMessages();
    await timeline.expectAtBottom();
    const beforeScrollHeight = await timeline.scrollHeight();
    await timeline.resetVisualProbe();

    await timeline.restoreLatestMessage();
    const samples = await waitForCheckpointFrames({beforeScrollHeight, direction: "grow", timeline});

    assertBottomLocked({samples});
  });

  test("manual restore from a detached position restores the latest message without moving visible content", async ({timeline}) => {
    await timeline.undoLatestWithSlashCommand();
    await timeline.detachFar();
    await timeline.expandRolledBackMessages();
    const before = await timeline.captureVisibleTextAnchor();
    const beforeScrollHeight = await timeline.scrollHeight();
    await timeline.resetVisualProbe();

    await timeline.restoreLatestMessage();
    const samples = await waitForCheckpointFrames({beforeScrollHeight, direction: "grow", timeline});
    const after = await timeline.measureVisibleTextAnchor(before);

    assertAnchorUnmoved(before, after, samples);
  });

  test("message completes while following and stays at the bottom", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(60);
    await timeline.expectAtBottom();
    await timeline.resetVisualProbe();

    await timeline.completeMessage();
    await timeline.expectAtBottom();

    assertBottomLocked({samples: await waitForPrimaryFrames({timeline})});
  });

  test("message aborts while following and stays at the bottom", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(60);
    await timeline.expectAtBottom();
    await timeline.resetVisualProbe();

    await timeline.abortMessage();
    await timeline.expectAtBottom();

    assertBottomLocked({samples: await waitForPrimaryFrames({timeline})});
  });

  test("message completes while detached and keeps the same content visible without scrolling", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(90);
    await timeline.detachFar();
    const before = await timeline.captureVisibleTextAnchor();
    await timeline.resetVisualProbe();

    await timeline.completeMessage();
    const samples = await waitForPrimaryFrames({timeline});
    const after = await timeline.measureVisibleTextAnchor(before);

    assertAnchorUnmoved(before, after, samples);
  });

  test("message aborts while detached and keeps the same content visible without scrolling", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(90);
    await timeline.detachFar();
    const before = await timeline.captureVisibleTextAnchor();
    await timeline.resetVisualProbe();

    await timeline.abortMessage();
    const samples = await waitForPrimaryFrames({timeline});
    const after = await timeline.measureVisibleTextAnchor(before);

    assertAnchorUnmoved(before, after, samples);
  });
});
