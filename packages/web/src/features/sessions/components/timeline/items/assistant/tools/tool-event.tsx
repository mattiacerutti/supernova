import {useState} from "react";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import ToolDetails from "@/features/sessions/components/timeline/items/assistant/tools/tool-details";
import ToolTitle from "@/features/sessions/components/timeline/items/assistant/tools/tool-title";
import {hasToolDetails} from "@/features/sessions/lib/timeline/tool-details";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

export type ToolDetailMode = "collapsible" | "visible";

type ToolEvent = Extract<SessionWorkEvent, {type: "tool"}>;

export default function ToolEvent(props: {event: ToolEvent; mode: ToolDetailMode}) {
  const {event, mode} = props;
  const [expanded, setExpanded] = useState(false);
  // Details such as diffs are expensive to render and start out hidden inside
  // collapsed groups, so they mount on first request and then stay mounted so
  // collapsing can animate them away.
  const [detailsRequested, setDetailsRequested] = useState(false);

  const detailsAvailable = hasToolDetails(event.tool);
  const showDetails = detailsAvailable && (mode === "visible" || expanded);
  const renderDetails = detailsAvailable && (mode === "visible" || detailsRequested);

  const handleToggle = (): void => {
    setExpanded((currentExpanded) => !currentExpanded);
    setDetailsRequested(true);
  };

  return (
    <div className="min-w-0 text-sm">
      {mode === "collapsible" && detailsAvailable ? (
        <Button
          aria-expanded={showDetails}
          className="group flex w-full min-w-0 items-center gap-2 px-0 py-0 text-left text-ink-faint hover:text-ink-muted"
          onClick={handleToggle}
          variant="ghost"
        >
          <ToolTitle event={event} />
          <Icon className={cn("transition-transform duration-160 ease-out", showDetails && "rotate-90")} name="chevron-right" size="xs" />
        </Button>
      ) : (
        <div className="flex min-w-0 items-start gap-2 text-ink-faint">
          <ToolTitle event={event} />
        </div>
      )}
      {detailsAvailable && (
        <div
          className={cn(
            "min-w-0",
            mode === "collapsible"
              ? "grid grid-rows-[0fr] opacity-0 will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] duration-240 ease-in-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
              : "mt-2"
          )}
          data-expanded={showDetails}
        >
          <div className="min-h-0 min-w-0 overflow-hidden">
            <div className={cn("min-w-0", mode === "collapsible" && "pt-2")}>{renderDetails && <ToolDetails tool={event.tool} />}</div>
          </div>
        </div>
      )}
    </div>
  );
}
