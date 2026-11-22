import type {Terminal} from "@xterm/xterm";
import type {TerminalDisplay} from "@/features/workspace/api/terminal/terminal-session";

const CANCEL = "\x18";

/** `fit` runs once a snapshot is drawn, so the grid returns to the tab's size from the size it was taken at. */
export function terminalDisplay(terminal: Pick<Terminal, "reset" | "resize" | "write">, fit: () => void): TerminalDisplay {
  return {
    // In the write queue: a synchronous reset would let output still queued draw over the snapshot. `reset()` keeps a
    // sequence a dropped connection left half read, so CAN cancels it first.
    reset: (cols, rows, screen, drawn) => {
      terminal.write(CANCEL, () => {
        terminal.reset();
        terminal.resize(cols, rows);
      });
      terminal.write(screen, () => {
        drawn();
        fit();
      });
    },
    write: (data, drawn) => terminal.write(data, drawn),
  };
}
