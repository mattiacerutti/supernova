import type {Terminal} from "@xterm/xterm";
import xtermHeadless from "@xterm/headless";
import {afterEach, describe, expect, it} from "vitest";
import {silenceTerminalQueries} from "@/features/workspace/lib/terminal/silence-terminal-queries";

// The parser and `onData` are the browser xterm's; headless runs them without a DOM.
function terminal() {
  const created = new xtermHeadless.Terminal({allowProposedApi: true, cols: 80, rows: 24});
  const sent: string[] = [];
  created.onData((data) => sent.push(data));
  const silenced = silenceTerminalQueries(created as unknown as Terminal);
  const write = (data: string) => new Promise<void>((resolve) => created.write(data, resolve));
  return {created, sent, silenced, write};
}

describe("silenceTerminalQueries", () => {
  const made: ReturnType<typeof terminal>[] = [];
  afterEach(() => {
    for (const each of made.splice(0)) each.created.dispose();
  });
  const open = () => {
    const each = terminal();
    made.push(each);
    return each;
  };

  it.each([
    ["cursor position", "\x1b[6n"],
    ["DEC cursor position", "\x1b[?6n"],
    ["device status", "\x1b[5n"],
    ["primary device attributes", "\x1b[c"],
    ["secondary device attributes", "\x1b[>c"],
    ["ANSI mode", "\x1b[4$p"],
    ["DEC mode", "\x1b[?2004$p"],
    ["foreground color", "\x1b]10;?\x1b\\"],
    ["background color", "\x1b]11;?\x07"],
    ["cursor color", "\x1b]12;?\x1b\\"],
  ])("leaves a %s query to the server", async (_name, query) => {
    const {sent, write} = open();
    await write(query);
    expect(sent).toEqual([]);
  });

  it("still applies what the output sets, and still sends what is typed", async () => {
    const {created, sent, write} = open();
    await write("\x1b[?2004h\x1b]11;#102030\x1b\\");
    expect(created.modes.bracketedPasteMode).toBe(true);

    created.input("ls\r");
    expect(sent).toEqual(["ls\r"]);
  });

  it("answers again once disposed", async () => {
    const {sent, silenced, write} = open();
    silenced.dispose();
    await write("\x1b[6n");
    expect(sent).toEqual(["\x1b[1;1R"]);
  });
});
