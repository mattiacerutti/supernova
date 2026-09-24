import {useState} from "react";
import type {CSSProperties, ReactNode} from "react";
import Icon from "@/components/ui/icon";
import type {IconName} from "@/components/ui/icon";
import ToolDetails from "@/features/sessions/components/timeline/items/assistant/tools/tool-details";
import ToolTitle from "@/features/sessions/components/timeline/items/assistant/tools/tool-title";
import {hasToolDetails, toolIcon} from "@/features/sessions/lib/timeline/tool-details";
import type {SessionWorkEvent} from "@/features/sessions/types/session-timeline-item";
import {cn} from "@/lib/cn";

// Row geometry (px). The rail is drawn from these so the trunk, elbow, and
// icon line up regardless of how tall an expanded row becomes.
const ROW_HEIGHT = 32;
const TRUNK_X = 10.5;
const BEND_RADIUS = 6;
const BRANCH_END_X = 26;
const ICON_LEFT = 30;
const ICON_SIZE = 14;
const GUTTER_WIDTH = 54;
// Half-pixel so the 1px horizontal leg lands on one pixel row, like the trunk.
const BEND_Y = ROW_HEIGHT / 2 - BEND_RADIUS + 0.5;
const BRANCH_LENGTH = (Math.PI / 2) * BEND_RADIUS + (BRANCH_END_X - TRUNK_X - BEND_RADIUS);

// Arrival timing (ms), split from one 480ms ease-out-quint connector reveal:
// the previous row's continuation grows first, then this row's trunk, then
// the elbow and content. Rows without a predecessor start drawing immediately.
const CONNECTOR_TIMING = {
  first: {incoming: [0, 84], branch: [77, 403]},
  next: {incoming: [55, 52], branch: [97, 383]},
} as const;
const CONTINUATION_DURATION = 55;

/** Inline timing for one `animate-work-*` utility; undefined when the row was already present. */
function phase(delay: number | undefined, [offset, duration]: readonly [number, number]): CSSProperties | undefined {
  if (delay === undefined) return undefined;
  return {animationDelay: `${delay + offset}ms`, animationDuration: `${duration}ms`};
}

interface RailProps {
  readonly continues: boolean;
  /** Arrival delay of the row after this one, when it is still arriving. */
  readonly continuationDelay: number | undefined;
  readonly error: boolean;
  readonly hasPredecessor: boolean;
  readonly icon: IconName;
  /** Arrival delay of this row, or undefined when it was already present. */
  readonly revealDelay: number | undefined;
}

function Rail(props: RailProps) {
  const {continues, continuationDelay, error, hasPredecessor, icon, revealDelay} = props;
  const timing = hasPredecessor ? CONNECTOR_TIMING.next : CONNECTOR_TIMING.first;
  const animate = revealDelay !== undefined;

  // One SVG per row, stroked in solid ink with the border's translucency applied
  // to the SVG as a whole. Where the elbow leaves the trunk the strokes overlap,
  // and group opacity keeps that from summing into a brighter joint.
  return (
    <div aria-hidden="true" className="relative shrink-0 self-stretch" style={{width: GUTTER_WIDTH}}>
      <svg
        className="absolute inset-0 size-full overflow-visible text-ink opacity-12 [transform-box:view-box] *:motion-reduce:animate-none"
        fill="none"
        preserveAspectRatio="none"
        stroke="currentColor"
        strokeWidth={1}
      >
        <line
          className={cn(animate && "animate-work-rail-grow")}
          style={{...phase(revealDelay, timing.incoming), transformOrigin: `${TRUNK_X}px 0`}}
          x1={TRUNK_X}
          x2={TRUNK_X}
          y1={0}
          y2={BEND_Y}
        />
        {continues && (
          <line
            className={cn(continuationDelay !== undefined && "animate-work-rail-grow")}
            style={{...phase(continuationDelay, [0, CONTINUATION_DURATION]), transformOrigin: `${TRUNK_X}px ${BEND_Y}px`}}
            x1={TRUNK_X}
            x2={TRUNK_X}
            y1={BEND_Y}
            y2="100%"
          />
        )}
        <path
          className={cn(animate && "animate-work-rail-draw")}
          d={`M${TRUNK_X} ${BEND_Y} A${BEND_RADIUS} ${BEND_RADIUS} 0 0 0 ${TRUNK_X + BEND_RADIUS} ${BEND_Y + BEND_RADIUS} H${BRANCH_END_X}`}
          strokeDasharray={BRANCH_LENGTH}
          style={{...phase(revealDelay, timing.branch), ["--rail-length" as string]: BRANCH_LENGTH}}
        />
      </svg>
      <Icon
        className={cn("absolute motion-reduce:animate-none", animate && "animate-work-reveal", error ? "text-danger-ink" : "text-ink-muted")}
        name={icon}
        style={{...phase(revealDelay, timing.branch), height: ICON_SIZE, left: ICON_LEFT, top: ROW_HEIGHT / 2 - ICON_SIZE / 2, width: ICON_SIZE}}
      />
    </div>
  );
}

interface WorkRowProps {
  readonly continuationDelay: number | undefined;
  readonly continues: boolean;
  readonly event: SessionWorkEvent;
  readonly hasPredecessor: boolean;
  readonly revealDelay: number | undefined;
}

export default function WorkRow(props: WorkRowProps) {
  const {continuationDelay, continues, event, hasPredecessor, revealDelay} = props;
  const tool = event.tool;
  const error = tool?.status === "error";
  const expandable = hasToolDetails(tool);
  const [expanded, setExpanded] = useState(false);
  // Details such as diffs are expensive, so they mount on first request and
  // then stay mounted so collapsing can animate them away.
  const [detailsRequested, setDetailsRequested] = useState(false);
  const open = expandable && expanded;

  const icon = toolIcon(tool);
  const timing = hasPredecessor ? CONNECTOR_TIMING.next : CONNECTOR_TIMING.first;

  const handleToggle = (): void => {
    setExpanded(!open);
    setDetailsRequested(true);
  };

  const detailBody: ReactNode = expandable && (open || detailsRequested) && <ToolDetails tool={tool} />;

  const header = (
    <div className={cn("flex min-w-0 items-baseline gap-3 text-sm leading-8", error ? "text-danger-ink" : "text-ink-muted")} style={{height: ROW_HEIGHT}}>
      <ToolTitle tool={tool} />
      {expandable && (
        <Icon
          className={cn("ml-auto shrink-0 self-center opacity-0 transition-[opacity,transform] duration-150 ease-out group-hover/row:opacity-100", open && "rotate-90")}
          name="chevron-right"
          size="xs"
        />
      )}
    </div>
  );

  return (
    <div className="flex min-w-0">
      <Rail continuationDelay={continuationDelay} continues={continues} error={error} hasPredecessor={hasPredecessor} icon={icon} revealDelay={revealDelay} />
      <div
        className={cn("min-w-0 flex-1 motion-reduce:animate-none", expandable && "group/row", revealDelay !== undefined && "animate-work-reveal")}
        style={phase(revealDelay, timing.branch)}
      >
        {expandable ? (
          <button aria-expanded={open} className="block w-full cursor-pointer text-left" onClick={handleToggle} type="button">
            {header}
          </button>
        ) : (
          header
        )}
        {expandable && (
          <div
            className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity] duration-150 ease-out data-[expanded=true]:grid-rows-[1fr] data-[expanded=true]:opacity-100"
            data-expanded={open}
          >
            <div className="min-h-0 min-w-0 overflow-hidden">
              <div className="min-w-0 pb-3 pr-1">{detailBody}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
