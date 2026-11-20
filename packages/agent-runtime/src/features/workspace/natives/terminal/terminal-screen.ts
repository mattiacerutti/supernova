import xtermSerialize from "@xterm/addon-serialize";
import xtermHeadless from "@xterm/headless";
import type {TerminalThemePayload} from "@supernova/contracts/services/workspace/procedures";

/** Matches the client's scrollback. */
const SCREEN_SCROLLBACK = 5_000;
/** Foreground, background, cursor: one OSC may ask for several, continuing in this order. */
const SPECIAL_COLORS = [10, 11, 12] as const;
/** Contour's dark/light protocol: the program asks to hear of scheme changes. */
const SCHEME_UPDATES_MODE = 2031;

const ESC = "\x1b";
const ST = `${ESC}\\`;

/** xterm's `rgb:rrrr/gggg/bbbb`, as the browser answered before the server did. */
function rgbReport(color: number): string {
  const channel = (shift: number) => ((color >> shift) & 0xff).toString(16).padStart(2, "0").repeat(2);
  return `rgb:${channel(16)}/${channel(8)}/${channel(0)}`;
}

function schemeReport(scheme: TerminalThemePayload["scheme"]): string {
  return `${ESC}[?997;${scheme === "dark" ? 1 : 2}n`;
}

/**
 * Follows every output byte, so a new viewer starts from the current screen rather than a replay. It is the one that
 * answers the program's queries, so the viewers' own terminals stay silent.
 */
export class TerminalScreen {
  private readonly terminal: InstanceType<typeof xtermHeadless.Terminal>;
  private readonly serializer = new xtermSerialize.SerializeAddon();
  private readonly reply: (data: string) => void;
  private theme: TerminalThemePayload;
  private schemeUpdates = false;
  private written = 0;
  private parsed = 0;

  public constructor(cols: number, rows: number, theme: TerminalThemePayload, reply: (data: string) => void) {
    this.theme = theme;
    this.reply = reply;
    this.terminal = new xtermHeadless.Terminal({allowProposedApi: true, cols, rows, scrollback: SCREEN_SCROLLBACK});
    // The addon's typings name the browser xterm; the headless one has the same addon interface.
    this.terminal.loadAddon(this.serializer as never);
    // Headless xterm answers cursor, device and mode queries through `onData`; colors and the scheme it cannot.
    this.terminal.onData(reply);
    for (const [offset, ident] of SPECIAL_COLORS.entries()) {
      this.terminal.parser.registerOscHandler(ident, (data) => this.reportColors(offset, data));
    }
    this.terminal.parser.registerCsiHandler({prefix: "?", final: "h"}, (params) => this.setSchemeUpdates(params, true));
    this.terminal.parser.registerCsiHandler({prefix: "?", final: "l"}, (params) => this.setSchemeUpdates(params, false));
    this.terminal.parser.registerCsiHandler({prefix: "?", final: "n"}, (params) => {
      if (params[0] !== 996) return false;
      reply(schemeReport(this.theme.scheme));
      return true;
    });
  }

  public get backlog(): number {
    return this.written - this.parsed;
  }

  /** `onParsed` runs in write order, so what it forwards follows every earlier snapshot exactly. */
  public write(bytes: Uint8Array, onParsed: () => void): void {
    this.written += bytes.length;
    this.terminal.write(bytes, () => {
      this.parsed += bytes.length;
      onParsed();
    });
  }

  public flush(callback: () => void): void {
    this.terminal.write(new Uint8Array(0), callback);
  }

  public snapshot(callback: (data: string) => void): void {
    this.flush(() => callback(this.serializer.serialize({scrollback: SCREEN_SCROLLBACK})));
  }

  public resize(cols: number, rows: number): void {
    this.terminal.resize(cols, rows);
  }

  public setTheme(theme: TerminalThemePayload): void {
    const previous = this.theme;
    this.theme = theme;
    if (this.schemeUpdates && previous.scheme !== theme.scheme) this.reply(schemeReport(theme.scheme));
  }

  public dispose(): void {
    this.terminal.dispose();
  }

  private reportColors(offset: number, data: string): boolean {
    // Setting a color only changes what a browser draws; the screen has nothing to draw.
    data.split(";").forEach((slot, index) => {
      const ident = SPECIAL_COLORS[offset + index];
      if (slot !== "?" || ident === undefined) return;
      const color = ident === 11 ? this.theme.background : this.theme.foreground;
      this.reply(`${ESC}]${ident};${rgbReport(color)}${ST}`);
    });
    return true;
  }

  // Not consumed: xterm sets every other mode in the same sequence.
  private setSchemeUpdates(params: (number | number[])[], enabled: boolean): boolean {
    if (params.includes(SCHEME_UPDATES_MODE)) this.schemeUpdates = enabled;
    return false;
  }
}
