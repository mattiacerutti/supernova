import type {IDisposable, Terminal} from "@xterm/xterm";

/** Device status, attributes and mode reports: what the server's screen answers. */
const CSI_QUERIES = [
  {final: "n"},
  {prefix: "?", final: "n"},
  {final: "c"},
  {prefix: ">", final: "c"},
  {intermediates: "$", final: "p"},
  {prefix: "?", intermediates: "$", final: "p"},
] as const;
/** Foreground, background, cursor; a slot of `?` asks. */
const COLOR_OSCS = [10, 11, 12] as const;

/**
 * The server answers these once for every tab; xterm would answer from each as if typed. The server has no palette or
 * status strings, so OSC 4 and DECRQSS stay with the tabs.
 */
export function silenceTerminalQueries(terminal: Terminal): IDisposable {
  const handlers = [
    ...CSI_QUERIES.map((id) => terminal.parser.registerCsiHandler(id, () => true)),
    ...COLOR_OSCS.map((ident) => terminal.parser.registerOscHandler(ident, (data) => data.split(";").includes("?"))),
  ];
  return {dispose: () => handlers.forEach((handler) => handler.dispose())};
}
