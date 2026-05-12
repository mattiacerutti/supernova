import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

interface MessageActionsProps {
  align?: "end" | "start";
  copyText: string;
}

export default function MessageActions(props: MessageActionsProps) {
  const {align = "start", copyText} = props;
  const [copied, setCopied] = useState(false);
  const canCopy = copyText.length > 0;

  const handleCopy = (): void => {
    if (!canCopy || copied) return;

    void navigator.clipboard.writeText(copyText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1000);
    });
  };

  if (!canCopy) return null;

  return (
    <div className={cn("mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover/message:opacity-100", copied && "opacity-100", align === "end" && "justify-end")}>
      <Button aria-label="Copy message" className="size-6" onClick={handleCopy} shape="icon" size="sm" title="Copy message" variant="ghost">
        <span className="relative grid size-3.5 place-items-center">
          <Icon
            className={cn("absolute opacity-0 transition-opacity duration-150 group-hover/message:opacity-100", copied && "opacity-0 group-hover/message:opacity-0")}
            name="copy"
            size="xs"
          />
          <Icon className={cn("absolute transition-opacity duration-150", copied ? "opacity-100" : "opacity-0")} name="check" size="xs" />
        </span>
      </Button>
    </div>
  );
}
