import {bool, num, obj, opt, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";

export const Terminal = obj({
  cwd: str(),
  exitCode: opt(num()),
  id: str(),
  number: num(),
  sessionId: str(),
  startedAt: str(),
});

export const TerminalOutput = obj({
  output: str(),
  /** Characters the cap dropped from the front. */
  dropped: num(),
  exitCode: opt(num()),
  closed: opt(bool()),
});

export class TerminalError extends TaggedError("TerminalError") {}

export class TerminalNotFoundError extends TaggedError("TerminalNotFoundError") {}

export type Terminal = Static<typeof Terminal>;
export type TerminalOutput = Static<typeof TerminalOutput>;
