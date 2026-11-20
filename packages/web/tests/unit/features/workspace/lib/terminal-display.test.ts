import type {Terminal} from "@xterm/xterm";
import xtermHeadless from "@xterm/headless";
import {expect, it} from "vitest";
import {terminalDisplay} from "@/features/workspace/lib/terminal/terminal-display";

// A snapshot can arrive while output sent before it is still queued in xterm.
it("draws a snapshot over output written before it, never under it", async () => {
  const terminal = new xtermHeadless.Terminal({allowProposedApi: true, cols: 40, rows: 6});
  const display = terminalDisplay(terminal as unknown as Terminal, () => undefined);
  display.write(new TextEncoder().encode("STALE OUTPUT"), () => undefined);
  await new Promise<void>((resolve) => display.reset(20, 4, new TextEncoder().encode("SNAPSHOT"), resolve));

  expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe("SNAPSHOT");
  expect([terminal.cols, terminal.rows]).toEqual([20, 4]);
  terminal.dispose();
});
