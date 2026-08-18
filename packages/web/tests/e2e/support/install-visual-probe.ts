import type {TimelineVisualSample} from "@e2e/support/timeline-test-api";

/** Installs a post-paint probe that records the native timeline geometry for every rendered frame. */
export function installTimelineVisualProbe(): void {
  const samples: TimelineVisualSample[] = [];

  const capturePaintedFrame = (): void => {
    const viewport = document.querySelector<HTMLElement>('[aria-label="Session timeline"]');
    if (!viewport) return;

    const style = window.getComputedStyle(viewport);
    const streamContent = viewport.querySelector<HTMLElement>("[data-timeline-stream-content]");
    const streamTransform = streamContent ? window.getComputedStyle(streamContent).transform : "none";
    const statusFooter = viewport.querySelector<HTMLElement>('[data-timeline-footer="streaming-status"]');
    samples.push({
      bottomDistance: viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
      clientHeight: viewport.clientHeight,
      lineCount: window.__supernovaTimelineMock?.getState().lineCount ?? 0,
      pathname: window.location.pathname,
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
      statusFooterTop: statusFooter?.getBoundingClientRect().top ?? null,
      streamOffset: streamTransform === "none" ? 0 : new DOMMatrixReadOnly(streamTransform).m42,
      source: "frame",
      timestamp: performance.now(),
      visible: style.display !== "none" && style.visibility !== "hidden",
    });

    if (samples.length > 10_000) samples.splice(0, 1_000);
  };

  const scheduleFrame = (): void => {
    window.requestAnimationFrame(() => {
      window.setTimeout(capturePaintedFrame, 0);
      scheduleFrame();
    });
  };
  scheduleFrame();

  window.__supernovaTimelineVisualProbe = {
    read: () => [...samples],
    reset: () => {
      samples.length = 0;
    },
  };
}
