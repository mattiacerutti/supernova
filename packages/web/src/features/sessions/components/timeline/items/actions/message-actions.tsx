import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

const messageTimeFormatter = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit", hourCycle: "h23"});

interface MessageActionsProps {
  align?: "end" | "start";
  copyText: string;
  onRevert?: () => void;
  timestamp?: string;
}

export default function MessageActions(props: MessageActionsProps) {
  const {align = "start", copyText, onRevert, timestamp} = props;

  const [copied, setCopied] = useState(false);
  const canCopy = copyText.length > 0;
  const timestampMs = timestamp === undefined ? NaN : Date.parse(timestamp);
  const hasTimestamp = Number.isFinite(timestampMs);

  const hasActions = canCopy || onRevert || hasTimestamp;

  const time = hasTimestamp && (
    <time className="px-1 text-[12px] leading-none tabular-nums text-ink-muted" dateTime={timestamp}>
      {messageTimeFormatter.format(timestampMs)}
    </time>
  );

  const handleCopy = (): void => {
    if (!canCopy || copied) return;

    void navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    });
  };

  if (!hasActions) return null;

  return (
    <div className={cn("flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100", copied && "opacity-100", align === "end" && "justify-end")}>
      {align === "end" && time}
      {canCopy && (
        <Button aria-label="Copy message" className={cn("size-6", align === "start" && "-ml-1.5")} onClick={handleCopy} shape="icon" size="sm" title="Copy message" variant="ghost">
          <span className="relative grid size-3 place-items-center">
            <Icon
              className={cn("absolute size-3 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100", copied && "opacity-0 group-hover/message:opacity-0")}
              name="copy"
              size="xs"
            />
            <Icon className={cn("absolute size-3 transition-opacity duration-150", copied ? "opacity-100" : "opacity-0")} name="check" size="xs" />
          </span>
        </Button>
      )}
      {align === "start" && time}
      {onRevert && (
        <Button aria-label="Revert to this message" className="size-6" onClick={onRevert} shape="icon" size="sm" title="Revert to this message" variant="ghost">
          <Icon name="undo" size="xs" />
        </Button>
      )}
    </div>
  );
}
