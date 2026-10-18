export const testShell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";

export function shellCommand(posix: string, windows: string): string {
  return process.platform === "win32" ? `${windows}\r` : `${posix}\n`;
}
