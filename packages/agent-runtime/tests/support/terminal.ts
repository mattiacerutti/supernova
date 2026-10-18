// These tests consume raw PTY output, without a terminal emulator for PowerShell's interactive line editor.
export const testShell = process.platform === "win32" ? "cmd.exe" : "/bin/sh";

export function shellCommand(posix: string, windows: string): string {
  return process.platform === "win32" ? `${windows}\r` : `${posix}\n`;
}
