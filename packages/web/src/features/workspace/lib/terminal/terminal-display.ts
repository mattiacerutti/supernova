import type {Terminal} from "@xterm/xterm";
import type {TerminalDisplay} from "@/features/workspace/api/terminal/terminal-session";

/** `fit` runs once a snapshot is drawn, so the grid returns to the tab's size from the size it was taken at. */
export function terminalDisplay(terminal: Pick<Terminal, "reset" | "resize" | "write">, fit: () => void): TerminalDisplay {
  return {
    // In the write queue: a synchronous reset would let output still queued draw over the snapshot.
    reset: (cols, rows, screen, drawn) => {
      terminal.write(new Uint8Array(0), () => {
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
