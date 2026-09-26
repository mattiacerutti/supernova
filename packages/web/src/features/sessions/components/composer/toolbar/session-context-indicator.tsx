import type {SessionContextUsage} from "@supernova/contracts/sessions/schemas";
import Button from "@/components/ui/button";
import Menu, {MenuLabel} from "@/components/ui/menu";

const CIRCLE_RADIUS = 8;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;
const UNKNOWN_RING_DASH_LENGTH = 1.75;
const UNKNOWN_RING_DASH_GAP = CIRCLE_CIRCUMFERENCE / 10 - UNKNOWN_RING_DASH_LENGTH;

function formatTokens(tokens: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(tokens)));
}

function formatContextTokens(tokens: number | null): string {
  return tokens === null ? "?" : formatTokens(tokens);
}

interface ContextUsageCircleProps {
  readonly percentage: number | null;
}

function ContextUsageCircle(props: ContextUsageCircleProps) {
  const {percentage} = props;

  if (percentage === null) {
    return (
      <span aria-hidden="true" className="relative grid size-5 place-items-center text-xs font-medium leading-none">
        <svg className="absolute inset-0 size-5 -rotate-90" viewBox="0 0 20 20">
          <circle className="stroke-border" cx="10" cy="10" fill="none" r={CIRCLE_RADIUS} strokeWidth="2" />
          <circle
            className="stroke-ink"
            cx="10"
            cy="10"
            fill="none"
            r={CIRCLE_RADIUS}
            strokeDasharray={`${UNKNOWN_RING_DASH_LENGTH} ${UNKNOWN_RING_DASH_GAP}`}
            strokeLinecap="round"
            strokeWidth="2"
          />
        </svg>
        <span>?</span>
      </span>
    );
  }

  const clampedPercentage = Math.max(0, Math.min(100, percentage));
  const strokeOffset = CIRCLE_CIRCUMFERENCE * (1 - clampedPercentage / 100);

  return (
    <svg aria-hidden="true" className="size-5 -rotate-90" viewBox="0 0 20 20">
      <circle className="stroke-border" cx="10" cy="10" fill="none" r={CIRCLE_RADIUS} strokeWidth="2" />
      <circle
        className="stroke-ink transition-[stroke-dashoffset] duration-300"
        cx="10"
        cy="10"
        fill="none"
        r={CIRCLE_RADIUS}
        strokeDasharray={CIRCLE_CIRCUMFERENCE}
        strokeDashoffset={strokeOffset}
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

interface SessionContextIndicatorProps {
  readonly context: SessionContextUsage;
}

export default function SessionContextIndicator(props: SessionContextIndicatorProps) {
  const {context} = props;
  const percentage = context.usedTokens === null ? null : context.contextWindow > 0 ? (context.usedTokens / context.contextWindow) * 100 : 0;
  const label = `${formatContextTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)} tokens`;

  return (
    <Menu
      align="end"
      className="w-56"
      sideOffset={10}
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="grid size-7 place-items-center rounded-full p-0 text-ink" title={label} type="button" variant="primary">
          <ContextUsageCircle percentage={percentage} />
        </Button>
      )}
      triggerLabel="Show context usage"
    >
      <MenuLabel className="flex items-center justify-between gap-4">
        <span>Context window</span>
        <span className="shrink-0 tabular-nums text-ink">{percentage === null ? "?" : `${Math.round(percentage)}%`}</span>
      </MenuLabel>
      <div className="space-y-3 px-2 pb-1 pt-1.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-overlay-pressed">
          {percentage === null ? (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-ink" />
          ) : (
            <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{width: `${Math.max(0, Math.min(100, percentage))}%`}} />
          )}
        </div>
        <div className="space-y-1 text-xs leading-5">
          <div className="flex items-center justify-between gap-4 text-ink-muted">
            <span>Used</span>
            <span className="max-w-32 truncate font-medium tabular-nums text-ink">{formatContextTokens(context.usedTokens)}</span>
          </div>
          <div className="flex items-center justify-between gap-4 text-ink-muted">
            <span>Window</span>
            <span className="max-w-32 truncate font-medium tabular-nums text-ink">{formatTokens(context.contextWindow)}</span>
          </div>
        </div>
      </div>
    </Menu>
  );
}
