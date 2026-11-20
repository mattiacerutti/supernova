import {num, obj, opt, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const Terminal = obj({
  cwd: str(),
  exitCode: opt(num()),
  id: str(),
  number: num(),
  sessionId: str(),
  startedAt: str(),
});

/** The terminal itself is gone; after any other close, the client reconnects. */
export const TERMINAL_CLOSED_CODE = 4000;
/** The token was spent or expired: the terminal runs, and a new token reconnects. */
export const TERMINAL_RETRY_CODE = 4001;

export class TerminalError extends TaggedError("TerminalError") {}

export class TerminalNotFoundError extends TaggedError("TerminalNotFoundError") {}

export type Terminal = Static<typeof Terminal>;

/** A text frame on the byte channel; binary frames are output. `reset` precedes a snapshot at that size. */
export type TerminalChannelEvent = {readonly type: "reset"; readonly cols: number; readonly rows: number} | {readonly type: "exit"; readonly exitCode: number};

/** A client's text frame: bytes drawn, which free the server to send more. */
export type TerminalChannelAck = {readonly type: "ack"; readonly bytes: number};
