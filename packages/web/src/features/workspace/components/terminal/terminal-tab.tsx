import {WebglAddon} from "@xterm/addon-webgl";
import type {ITheme} from "@xterm/xterm";
import {Terminal} from "@xterm/xterm";
import {useRef, useState} from "react";
import {useAttachTerminal} from "@/features/workspace/api/terminal/terminal-session";
import {fitTerminal} from "@/features/workspace/lib/terminal/fit-terminal";
import type {WorkspaceTerminalTab} from "@/features/workspace/types/workspace-panel";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {useSettingsStore} from "@/stores/settings-store";
import "@xterm/xterm/css/xterm.css";

/** Resolves a CSS color expression (the theme uses `color-mix` and relative colors) to a plain `rgb()` string. */
function resolveColor(host: HTMLElement, expression: string): string {
  const probe = document.createElement("span");
  probe.style.color = expression;
  host.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}

function terminalTheme(host: HTMLElement): ITheme {
  return {
    background: resolveColor(host, "var(--color-surface)"),
    cursor: resolveColor(host, "var(--color-ink)"),
    foreground: resolveColor(host, "var(--color-ink)"),
    selectionBackground: resolveColor(host, "var(--color-overlay-strong)"),
  };
}

interface TerminalTabProps {
  /** Where the shell runs: the session's worktree or project. */
  readonly cwd: string;
  readonly sessionId: string;
  readonly tab: WorkspaceTerminalTab;
}

/**
 * A shell on the server, rendered with xterm.js and its WebGL renderer.
 *
 * The shell belongs to the tab: it keeps running while the tab is hidden or the session is not open, and dies
 * when the tab is closed. Reopening the app reattaches by tab id.
 */
export default function TerminalTab(props: TerminalTabProps) {
  const {cwd, sessionId, tab} = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const attachTerminal = useAttachTerminal();
  const [status, setStatus] = useState<{readonly kind: "running"} | {readonly kind: "exited"; readonly exitCode: number} | {readonly kind: "error"; readonly message: string}>({
    kind: "running",
  });

  // The tab lives inside React's <Activity>, which runs effect cleanups when hidden and effects again when shown.
  // The terminal must outlive that, or every tab switch would rebuild it and replay history. It is created once and
  // torn down only when the component actually unmounts, which is when its host has left the document.
  const instance = useRef<{readonly dispose: () => void} | null>(null);

  useMountEffect(() => {
    const host = hostRef.current;
    if (!host || instance.current) return;

    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: getComputedStyle(host).getPropertyValue("--font-mono"),
      fontSize: 12,
      macOptionIsMeta: true,
      scrollback: 5_000,
      theme: terminalTheme(host),
    });
    terminal.open(host);
    // WebGL draws in the same frame the grid changes, so a drag never shows a half-painted terminal. Losing the
    // context (GPU reset, too many contexts) falls back to the DOM renderer, which keeps working.
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    terminal.loadAddon(webgl);
    fitTerminal(terminal, host);
    // Focused from the start so the cursor shows while the shell reads its rc files, like a native terminal window.
    terminal.focus();

    const session = attachTerminal({
      cols: terminal.cols,
      cwd,
      id: tab.id,
      onError: (message) => setStatus({kind: "error", message}),
      onEvent: (event) => {
        switch (event.type) {
          case "terminal.history":
            terminal.reset();
            terminal.write(event.data);
            break;
          case "terminal.output":
            terminal.write(event.data);
            break;
          case "terminal.exited":
            setStatus({kind: "exited", exitCode: event.exitCode});
            break;
          case "terminal.closed":
            break;
        }
      },
      rows: terminal.rows,
      sessionId,
    });

    const input = terminal.onData((data) => session.write(data));
    // The grid and the shell change size in the same frame, so neither ever wraps output for a width the other
    // does not have. `onResize` fires only when the dimensions actually changed.
    const resize = terminal.onResize(({cols, rows}) => session.resize(cols, rows));
    // ResizeObserver already delivers one callback per frame, so no further batching is needed. A hidden tab reports
    // a 0×0 host; fitting then would collapse the grid, so it waits for the hidden→visible transition instead.
    const refit = (): void => {
      if (host.clientWidth > 0 && host.clientHeight > 0) fitTerminal(terminal, host);
    };
    const observer = new ResizeObserver(refit);
    observer.observe(host);
    // A font that finishes loading after the first fit changes the cell width, and with it how many columns fit.
    document.fonts.addEventListener("loadingdone", refit);
    const unsubscribeTheme = useSettingsStore.subscribe((state, previous) => {
      if (state.resolvedMode !== previous.resolvedMode || state.themeId !== previous.themeId) terminal.options.theme = terminalTheme(host);
      if (state.codeFont !== previous.codeFont) {
        terminal.options.fontFamily = getComputedStyle(host).getPropertyValue("--font-mono");
        refit();
      }
    });

    instance.current = {
      dispose: () => {
        instance.current = null;
        document.fonts.removeEventListener("loadingdone", refit);
        unsubscribeTheme();
        observer.disconnect();
        input.dispose();
        resize.dispose();
        session.detach();
        terminal.dispose();
      },
    };

    return () => {
      // Hidden by <Activity>: the host stays in the document and the terminal keeps running. Unmounted: it is gone.
      if (!host.isConnected) instance.current?.dispose();
    };
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
      <div className="relative min-h-0 flex-1 pl-2 pt-2">
        <div className="h-full w-full" ref={hostRef} />
      </div>
      {status.kind !== "running" && (
        <p className="shrink-0 border-t border-border-muted px-3 py-2 text-xs text-ink-muted" role="status">
          {status.kind === "exited" ? `Shell exited with code ${status.exitCode}. Close this tab and open a new terminal to start another.` : status.message}
        </p>
      )}
    </div>
  );
}
