import {WebglAddon} from "@xterm/addon-webgl";
import type {ITheme} from "@xterm/xterm";
import {Terminal} from "@xterm/xterm";
import {useRef, useState} from "react";
import {useAttachTerminal} from "@/features/workspace/api/terminal/terminal-session";
import {fitTerminal} from "@/features/workspace/lib/terminal/fit-terminal";
import {useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import type {WorkspaceTerminalTab} from "@/features/workspace/types/workspace-panel";
import {useMountEffect} from "@/hooks/use-mount-effect";
import {useSettingsStore} from "@/stores/settings-store";
import "@xterm/xterm/css/xterm.css";

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

function statusMessage(tab: WorkspaceTerminalTab, error: string | undefined): string | undefined {
  if (error) return error;
  if (tab.closed) return "This terminal was closed. Close the tab and open a new terminal to start another.";
  if (tab.exitCode !== undefined) return `Shell exited with code ${tab.exitCode}. Close this tab and open a new terminal to start another.`;
  return undefined;
}

interface TerminalTabProps {
  readonly cwd: string;
  readonly sessionId: string;
  readonly tab: WorkspaceTerminalTab;
}

/** The shell belongs to the session, not the tab. A tab without a `number` starts its shell; any other reattaches. */
export default function TerminalTab(props: TerminalTabProps) {
  const {cwd, sessionId, tab} = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const attachTerminal = useAttachTerminal();
  const updateTab = useWorkspacePanelStore((state) => state.updateTab);
  const [error, setError] = useState<string>();

  // <Activity> re-runs effects on every show; the terminal must outlive that or each switch would replay history.
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
    // WebGL paints in the same frame the grid changes; losing the context falls back to the DOM renderer.
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    terminal.loadAddon(webgl);
    fitTerminal(terminal, host);
    terminal.focus();

    const update = (change: Partial<WorkspaceTerminalTab>): void => updateTab<WorkspaceTerminalTab>(sessionId, tab.id, (current) => ({...current, ...change}));
    const session = attachTerminal({
      cols: terminal.cols,
      cwd,
      id: tab.id,
      onChange: (change) => {
        switch (change.type) {
          case "terminal.history":
            terminal.reset();
            terminal.write(change.data);
            break;
          case "terminal.output":
            terminal.write(change.data);
            break;
          case "terminal.exited":
            update({exitCode: change.exitCode});
            break;
          case "terminal.closed":
            update({closed: true});
            break;
          case "terminal.error":
            setError(change.message);
            break;
        }
      },
      onStarted: (started) => update({number: started.number}),
      rows: terminal.rows,
      sessionId,
      start: tab.number === undefined,
    });

    const input = terminal.onData((data) => session.write(data));
    // Grid and shell resize in the same frame, so neither wraps for a width the other lacks.
    const resize = terminal.onResize(({cols, rows}) => session.resize(cols, rows));
    // Several clients can show one shell, and the last to resize sets its size. Focusing this one takes it back.
    const claimSize = (): void => session.resize(terminal.cols, terminal.rows);
    terminal.textarea?.addEventListener("focus", claimSize);
    // A hidden tab reports 0×0; fitting then would collapse the grid, so it waits for the show.
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
        terminal.textarea?.removeEventListener("focus", claimSize);
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

  const message = statusMessage(tab, error);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col bg-surface">
      <div className="relative min-h-0 flex-1 pl-2 pt-2">
        <div className="h-full w-full" ref={hostRef} />
      </div>
      {message && (
        <p className="shrink-0 border-t border-border-muted px-3 py-2 text-xs text-ink-muted" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
