import {int, num, obj, oneOf, type Static, str} from "@earendil-works/chord";
import {Terminal} from "@supernova/contracts/services/workspace/schemas";

export const TerminalOpenPayload = obj({
  cols: num(),
  cwd: str(),
  id: str(),
  rows: num(),
  sessionId: str(),
});

export const TerminalOpenResult = Terminal;

export const TerminalResizePayload = obj({
  cols: int({min: 1}),
  rows: int({min: 1}),
});

export const TerminalClosePayload = obj({
  id: str(),
});

const Color = int({min: 0, max: 0xffffff});

/** Answers programs that ask the terminal for its colors. */
export const TerminalThemePayload = obj({
  background: Color,
  foreground: Color,
  scheme: oneOf("light", "dark"),
});

export const TerminalChannelResult = obj({
  /** One use, and it expires: open `TERMINAL_SOCKET_PATH?token=` right after. */
  token: str(),
});

export type TerminalOpenPayload = Static<typeof TerminalOpenPayload>;
export type TerminalOpenResult = Static<typeof TerminalOpenResult>;
export type TerminalResizePayload = Static<typeof TerminalResizePayload>;
export type TerminalClosePayload = Static<typeof TerminalClosePayload>;
export type TerminalChannelResult = Static<typeof TerminalChannelResult>;
export type TerminalThemePayload = Static<typeof TerminalThemePayload>;
