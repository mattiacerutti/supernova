import {FitAddon, Ghostty, Terminal as GhosttyTerminal} from "ghostty-web";
import ghosttyWasmUrl from "ghostty-web/ghostty-vt.wasm?url";
import {useRef, useState} from "react";
import {useAttachTerminal} from "@/features/workspace/api/terminal/terminal-session";
import {attachFocusCursor} from "@/features/workspace/lib/terminal/focus-cursor";
import {attachNativeScrollbar} from "@/features/workspace/lib/terminal/native-scrollbar";
import type {WorkspaceTerminalTab} from "@/features/workspace/types/workspace-panel";
import {useMountEffect} from "@/hooks/use-mount-effect";

const PTY_RESIZE_SETTLE_MS = 150;
/** Slightly over the fit addon's own post-resize cooldown. */
const FIT_COOLDOWN_MS = 60;

/** One WASM instance per page; every terminal shares it. */
let ghosttyLoad: Promise<Ghostty> | undefined;
function loadGhostty(): Promise<Ghostty> {
  ghosttyLoad ??= Ghostty.load(ghosttyWasmUrl);
  return ghosttyLoad;
}

/** Reads a CSS variable so the terminal's canvas colors follow the app theme. */
function themeColor(element: HTMLElement, name: string): string {
  return getComputedStyle(element).getPropertyValue(name).trim();
}

interface TerminalTabProps {
  /** Where the shell runs: the session's worktree or project. */
  readonly cwd: string;
  readonly sessionId: string;
  readonly tab: WorkspaceTerminalTab;
}

/**
 * A shell on the server, rendered with Ghostty's terminal core compiled to WebAssembly (`ghostty-web`, an
 * xterm.js-compatible API). Its renderer repaints in the same frame the container resizes, so dragging the panel
 * never shows a blank or half-drawn terminal; that is why it is used over xterm.js.
 *
 * The shell belongs to the tab: it keeps running while the tab is hidden or the session is not open, and dies
 * when the tab is closed. Reopening the app reattaches by tab id.
 */
export default function TerminalTab(props: TerminalTabProps) {
  const {cwd, sessionId, tab} = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
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
    const scroller = scrollerRef.current;
    if (!host || !scroller || instance.current) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    instance.current = {
      dispose: () => {
        disposed = true;
        cleanup?.();
        instance.current = null;
      },
    };

    void loadGhostty()
      .then((ghostty) => {
        if (disposed) return;

        const terminal = new GhosttyTerminal({
          cursorBlink: true,
          fontFamily: themeColor(host, "--font-mono"),
          fontSize: 12,
          ghostty,
          scrollback: 5_000,
          theme: {
            background: themeColor(host, "--color-surface"),
            cursor: themeColor(host, "--color-ink"),
            foreground: themeColor(host, "--color-ink"),
            selectionBackground: themeColor(host, "--color-overlay-strong"),
          },
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(host);
        fit.fit();
        const scrollbar = attachNativeScrollbar(terminal, scroller);
        const detachFocusCursor = attachFocusCursor(terminal, host);
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
                // ghostty-web throws on an empty write (zero-length WASM buffer copy); a fresh shell has no history yet.
                if (event.data.length > 0) terminal.write(event.data);
                scrollbar.sync();
                break;
              case "terminal.output":
                if (event.data.length > 0) terminal.write(event.data);
                scrollbar.sync();
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
        // The grid reflows locally on every step of a drag; the shell hears only the settled size, or it reprints its
        // prompt at each intermediate width and the row under the cursor jumps.
        let resizeTimer: number | undefined;
        const resize = terminal.onResize(({cols, rows}) => {
          window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => session.resize(cols, rows), PTY_RESIZE_SETTLE_MS);
        });
        // Fit on size changes, including the hidden→visible transition, which reports a 0×0 host while hidden.
        // ghostty-web's fit addon ignores calls for 50 ms after a resize, so a fast drag can drop the last one;
        // a trailing fit after that window makes sure the grid ends up matching the container.
        let trailingFit: number | undefined;
        const refit = (): void => {
          if (host.clientWidth === 0 || host.clientHeight === 0) return;
          fit.fit();
          window.clearTimeout(trailingFit);
          trailingFit = window.setTimeout(() => fit.fit(), FIT_COOLDOWN_MS);
        };
        const observer = new ResizeObserver(refit);
        observer.observe(host);
        // A font that finishes loading after the first fit changes the cell width, and with it how many columns fit.
        document.fonts.addEventListener("loadingdone", refit);

        cleanup = () => {
          window.clearTimeout(resizeTimer);
          window.clearTimeout(trailingFit);
          document.fonts.removeEventListener("loadingdone", refit);
          observer.disconnect();
          input.dispose();
          resize.dispose();
          session.detach();
          scrollbar.detach();
          detachFocusCursor();
          terminal.dispose();
        };
      })
      .catch((cause: unknown) => {
        if (!disposed) setStatus({kind: "error", message: cause instanceof Error && cause.message ? cause.message : "Failed to load the terminal."});
      });

    return () => {
      // Hidden by <Activity>: the host stays in the document and the terminal keeps running. Unmounted: it is gone.
      if (!host.isConnected) instance.current?.dispose();
    };
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
      {/* The wrapper reserves the right gutter for the native scroller; the fit host itself has no padding, since the fit addon measures its full box. */}
      <div className="relative min-h-0 flex-1 pl-2 pr-3 pt-2">
        {/* ghostty-web's hidden input textarea has opacity 0, which still lets Chromium paint a native caret at its corner. */}
        <div className="h-full w-full overflow-hidden [&_textarea]:caret-transparent" ref={hostRef} />
        <div aria-label="Terminal scrollback" className="absolute inset-y-0 right-0 w-3 overflow-y-scroll" ref={scrollerRef}>
          <div />
        </div>
      </div>
      {status.kind !== "running" && (
        <p className="shrink-0 border-t border-border-muted px-3 py-2 text-xs text-ink-muted" role="status">
          {status.kind === "exited" ? `Shell exited with code ${status.exitCode}. Close this tab and open a new terminal to start another.` : status.message}
        </p>
      )}
    </div>
  );
}
