import {formatForDisplay} from "@tanstack/react-hotkeys";
import type {Hotkey} from "@tanstack/react-hotkeys";
import {cn} from "@/lib/cn";

interface KbdProps {
  readonly className?: string;
  readonly hotkeys: readonly Hotkey[];
}

export default function Kbd(props: KbdProps) {
  const {className, hotkeys} = props;
  const keys = hotkeys.flatMap((hotkey) => formatForDisplay(hotkey, {parts: true}));

  return (
    <kbd className={cn("inline-flex h-4 items-center gap-0.5 rounded-sm bg-overlay-hover px-1 font-sans text-xs leading-none font-medium text-ink-muted", className)}>
      {keys.map((key, index) => (
        <span key={`${key}-${index}`}>{key}</span>
      ))}
    </kbd>
  );
}
