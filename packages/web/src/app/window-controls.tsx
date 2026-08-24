import Icon from "@/components/ui/icon";
import IconButton from "@/components/ui/icon-button";

/** Renders Windows controls aligned with the app header actions. */
export default function WindowControls() {
  return (
    <div aria-label="Window controls" className="ml-auto flex items-center gap-1" role="group">
      <IconButton className="size-7" label="Minimize window" onClick={() => void window.desktopApi?.minimizeWindow().catch(() => undefined)}>
        <Icon name="minus" size="xs" />
      </IconButton>
      <IconButton className="size-7" label="Maximize or restore window" onClick={() => void window.desktopApi?.toggleMaximizeWindow().catch(() => undefined)}>
        <Icon className="size-3" name="square" size="xs" />
      </IconButton>
      <IconButton className="size-7" label="Close window" onClick={() => void window.desktopApi?.closeWindow().catch(() => undefined)}>
        <Icon name="x" size="xs" />
      </IconButton>
    </div>
  );
}
