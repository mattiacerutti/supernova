export interface TimelineMockState {
  readonly lineCount: number;
  readonly status: "aborted" | "completed" | "idle" | "streaming";
  readonly turnCount: number;
  readonly undoneTurnCount: number;
}

export interface TimelineMockController {
  readonly completeStream: () => void;
  readonly emitLines: (lineCount: number) => void;
  readonly getState: () => TimelineMockState;
}

export interface TimelineVisualSample {
  readonly bottomDistance: number;
  readonly clientHeight: number;
  readonly lineCount: number;
  readonly pathname: string;
  readonly scrollHeight: number;
  readonly scrollTop: number;
  readonly statusFooterTop: number | null;
  readonly streamOffset: number;
  readonly source: "frame";
  readonly timestamp: number;
  readonly visible: boolean;
}

export interface TimelineVisualProbe {
  readonly read: () => readonly TimelineVisualSample[];
  readonly reset: () => void;
}

declare global {
  interface Window {
    __supernovaTimelineMock?: TimelineMockController;
    __supernovaTimelineVisualProbe?: TimelineVisualProbe;
  }
}
