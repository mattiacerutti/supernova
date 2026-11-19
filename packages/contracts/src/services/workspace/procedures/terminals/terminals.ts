import {int, num, obj, type Static, str} from "@earendil-works/chord";
import {Terminal} from "@supernova/contracts/services/workspace/schemas";

export const TerminalOpenPayload = obj({
  cols: num(),
  cwd: str(),
  id: str(),
  rows: num(),
  sessionId: str(),
});

export const TerminalOpenResult = Terminal;

export const TerminalWritePayload = obj({
  data: str(),
});

export const TerminalResizePayload = obj({
  cols: int({min: 1}),
  rows: int({min: 1}),
});

export const TerminalClosePayload = obj({
  id: str(),
});

export type TerminalOpenPayload = Static<typeof TerminalOpenPayload>;
export type TerminalOpenResult = Static<typeof TerminalOpenResult>;
export type TerminalWritePayload = Static<typeof TerminalWritePayload>;
export type TerminalResizePayload = Static<typeof TerminalResizePayload>;
export type TerminalClosePayload = Static<typeof TerminalClosePayload>;
