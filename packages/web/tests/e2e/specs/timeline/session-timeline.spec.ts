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

function assertAnimatedScroll(input: {readonly end: number; readonly label: string; readonly samples: readonly TimelineVisualSample[]; readonly start: number}): void {
  const {end, label, samples, start} = input;
  const frames = visibleSamples(samples, TIMELINE_SESSION_ID).filter((sample) => sample.source === "frame" && sample.scrollTop > start + 1 && sample.scrollTop < end - 1);
  const duration = (frames.at(-1)?.timestamp ?? 0) - (frames[0]?.timestamp ?? 0);
  const quarterFrame = frames.find((sample) => sample.scrollTop >= start + (end - start) / 4);

  expect(frames.length, `${label} should span multiple rendered frames`).toBeGreaterThanOrEqual(4);
  expect(duration, `${label} should be visibly animated`).toBeGreaterThanOrEqual(40);
  expect((quarterFrame?.timestamp ?? Number.POSITIVE_INFINITY) - (frames[0]?.timestamp ?? 0), `${label} should move immediately instead of easing in`).toBeLessThanOrEqual(40);
  expect(
    frames.find((sample) => sample.scrollButtonVisible),
    "the scroll-to-latest button should stay hidden during automatic scrolling"
  ).toBeUndefined();
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
    const initialSamples = await timeline.visualSamples();
    assertBottomLocked({minimumFrameCount: 1, samples: initialSamples});
    expect(
      initialSamples.find((sample) => sample.pathname === `/session/${TIMELINE_SESSION_ID}` && sample.scrollButtonVisible),
      "the scroll-to-latest button should stay hidden while the initial position settles"
    ).toBeUndefined();

    await timeline.resetVisualProbe();
    await timeline.switchToOtherSession();
    await timeline.expectAtBottom();
    const switchedSamples = await timeline.visualSamples();
    assertBottomLocked({minimumFrameCount: 1, samples: switchedSamples, sessionId: OTHER_SESSION_ID});
    expect(
      switchedSamples.find((sample) => sample.pathname === `/session/${OTHER_SESSION_ID}` && sample.scrollButtonVisible),
      "the scroll-to-latest button should stay hidden while a switched session settles"
    ).toBeUndefined();
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
    const samples = await timeline.visualSamples();
    const fittingFrames = visibleSamples(samples, EMPTY_SESSION_ID).filter((sample) => sample.scrollHeight <= sample.clientHeight);

    assertBottomLocked({minimumFrameCount: 1, samples, sessionId: EMPTY_SESSION_ID});
    expect(fittingFrames.length, "the stream should render while the new timeline still fits").toBeGreaterThanOrEqual(2);
    expect(Math.max(...fittingFrames.map((sample) => sample.streamOffset)), "content should not animate before scrolling is possible").toBeLessThanOrEqual(0.5);
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

  test("sending a message scrolls it to the top of the viewport and expands the response below it", async ({timeline}) => {
    await timeline.expectAtBottom();
    const scrollTopBeforeSend = await timeline.scrollTop();
    await timeline.resetVisualProbe();
    const messageText = "Anchor this message at the top of the timeline";
    await timeline.sendMessage(messageText);

    await expect.poll(() => timeline.messageViewportTop(messageText), {message: "the sent message should settle near the viewport top"}).toBeLessThanOrEqual(30);
    expect(await timeline.messageViewportTop(messageText), "the sent message should not overshoot the viewport top").toBeGreaterThanOrEqual(0);
    expect(await timeline.fakeSpaceHeight(), "fake space should back the anchored position").toBeGreaterThan(0);
    await timeline.expectAtBottom();

    const anchoredScrollTop = await timeline.scrollTop();
    assertAnimatedScroll({
      end: anchoredScrollTop,
      label: "the scroll that pins the message at the top",
      samples: await timeline.visualSamples(),
      start: scrollTopBeforeSend,
    });

    await timeline.waitForLineGrowth(5);
    expect(await timeline.messageViewportTop(messageText), "streamed rows should expand below the anchored message without scrolling").toBeLessThanOrEqual(30);
    await timeline.expectAtBottom();
  });

  test("the fake space below an anchored message is lossy when scrolling up", async ({timeline}) => {
    const messageText = "Anchor a message to create fake space";
    await timeline.sendMessage(messageText);
    await expect.poll(() => timeline.messageViewportTop(messageText), {message: "the sent message should settle near the viewport top"}).toBeLessThanOrEqual(30);
    const beforeScrollHeight = await timeline.scrollHeight();
    expect(await timeline.fakeSpaceHeight(), "the anchored message should leave meaningful fake space").toBeGreaterThan(120);

    await timeline.scrollUp(100);
    await expect.poll(() => timeline.scrollHeight(), {message: "scrolling up should destroy fake space"}).toBeLessThan(beforeScrollHeight - 50);
    await timeline.expectAtBottom();

    const shrunkenScrollHeight = await timeline.scrollHeight();
    await timeline.scrollDown(400);
    expect(await timeline.scrollHeight(), "scrolling back down must not recoup the lost space").toBeLessThanOrEqual(shrunkenScrollHeight);
    await timeline.expectAtBottom();
  });

  test("does not animate the first response paint", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.resetVisualProbe();

    await timeline.waitForLineGrowth(2);
    const samples = await timeline.visualSamples();
    const firstResponseFrames = visibleSamples(samples, TIMELINE_SESSION_ID).filter((sample) => sample.lineCount === 2);

    assertBottomLocked({minimumFrameCount: 1, samples});
    expect(firstResponseFrames.length, "the first response should produce a painted frame").toBeGreaterThanOrEqual(1);
    expect(Math.max(...firstResponseFrames.map((sample) => sample.streamOffset)), "the first response paint should appear without moving existing rows").toBeLessThanOrEqual(0.5);
  });

  test("streamed content stays bottom-locked in the same frame while auto-following", async ({timeline}) => {
    await timeline.sendMessage();
    await timeline.waitForLineGrowth(30);

    const samples = await timeline.recordStreamGrowth(60);
    const animatedFrames = visibleSamples(samples, TIMELINE_SESSION_ID).filter((sample) => sample.streamOffset > 0.5);
    const footerPositions = animatedFrames.flatMap((sample) => (sample.statusFooterTop === null ? [] : [sample.statusFooterTop]));

    assertBottomLocked({samples});
    expect(animatedFrames.length, "stream growth should animate independently of logical scrolling").toBeGreaterThanOrEqual(2);
    expect(Math.max(...animatedFrames.map((sample) => sample.streamOffset)), "stream animation should remain bounded while catching up").toBeLessThanOrEqual(57);
    expect(footerPositions.length, "the status footer should remain mounted during animation").toBe(animatedFrames.length);
    expect(Math.max(...footerPositions) - Math.min(...footerPositions), "the status footer should stay fixed while stream rows animate").toBeLessThanOrEqual(1);
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
    await timeline.detachFar();
    const detachedScrollTop = await timeline.scrollTop();
    await timeline.resetVisualProbe();

    await timeline.clickScrollToBottom();

    const attachedScrollTop = await timeline.scrollTop();
    const intermediateFrames = visibleSamples(await timeline.visualSamples(), TIMELINE_SESSION_ID).filter(
      (sample) => sample.source === "frame" && sample.scrollTop > detachedScrollTop + 1 && sample.scrollTop < attachedScrollTop - 1
    );
    expect(intermediateFrames, "scroll to latest should move instantly").toHaveLength(0);

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

  test("/undo of an anchored message collapses the fake space and pins the previous turn to the bottom", async ({timeline}) => {
    const messageText = "Anchor a message that will be undone";
    await timeline.sendMessage(messageText);
    await expect.poll(() => timeline.messageViewportTop(messageText), {message: "the sent message should settle near the viewport top"}).toBeLessThanOrEqual(30);
    await timeline.waitForLineGrowth(5);
    await timeline.abortMessage();
    const beforeScrollHeight = await timeline.scrollHeight();
    expect(await timeline.fakeSpaceHeight(), "the aborted anchored turn should leave fake space behind").toBeGreaterThan(0);

    await timeline.undoLatestWithSlashCommand();

    await expect.poll(() => timeline.fakeSpaceHeight(), {message: "reverting the anchored turn should collapse its fake space"}).toBe(0);
    expect(await timeline.scrollHeight(), "the reverted turn's blank space must not survive the undo").toBeLessThan(beforeScrollHeight);
    await timeline.expectAtBottom();
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
