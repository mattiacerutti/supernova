import Icon from "@/components/ui/icon";
import {MenuItem, MenuLabel} from "@/components/ui/menu";
import {useServerTerminals} from "@/features/workspace/api/terminal/terminal-session";
import {terminalLabel, useWorkspacePanelStore} from "@/features/workspace/stores/workspace-panel-store";
import type {WorkspacePanelTab} from "@/features/workspace/types/workspace-panel";

const startedFormatter = new Intl.DateTimeFormat(undefined, {hour: "2-digit", minute: "2-digit"});

interface AttachTerminalItemsProps {
  readonly sessionId: string;
  /** This window's tabs for the session; their terminals are already open here and not offered. */
  readonly tabs: readonly WorkspacePanelTab[];
}

/**
 * The session's shells this window does not show, for the + menu: running ones from other windows, or ones this
 * window detached. Rendered only while the menu is open, so the server's list reaches this client only then.
 */
export default function AttachTerminalItems(props: AttachTerminalItemsProps) {
  const {sessionId, tabs} = props;
  const serverTerminals = useServerTerminals();
  const attachTerminal = useWorkspacePanelStore((state) => state.attachTerminal);

  const open = new Set(tabs.map((tab) => tab.id));
  const available = Object.values(serverTerminals?.terminals ?? {})
    .filter((terminal) => terminal.sessionId === sessionId && !open.has(terminal.id))
    .sort((a, b) => a.number - b.number);
  if (available.length === 0) return null;

  return (
    <>
      <MenuLabel>Attach to a terminal</MenuLabel>
      {available.map((terminal) => (
        <MenuItem
          icon={<Icon name="terminal" size="xs" />}
          key={terminal.id}
          onClick={() => attachTerminal(sessionId, {exitCode: terminal.exitCode, id: terminal.id, number: terminal.number})}
          title={terminal.cwd}
          trailing={<span className="text-xs text-ink-faint">{terminal.exitCode === undefined ? startedFormatter.format(new Date(terminal.startedAt)) : "Exited"}</span>}
        >
          {terminalLabel(terminal.number)}
        </MenuItem>
      ))}
    </>
  );
}
