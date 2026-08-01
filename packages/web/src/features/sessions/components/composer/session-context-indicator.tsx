import type {SessionContextUsage} from "@supernova/contracts/sessions/schemas";
import Button from "@/components/ui/button";
import Menu from "@/components/ui/menu";

const CIRCLE_RADIUS = 8;
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * CIRCLE_RADIUS;

function formatTokens(tokens: number): string {
  return new Intl.NumberFormat("en-US").format(Math.max(0, Math.round(tokens)));
}

function formatContextTokens(tokens: number | null): string {
  return tokens === null ? "?" : formatTokens(tokens);
}

interface ContextUsageCircleProps {
  readonly percentage: number;
}

function ContextUsageCircle(props: ContextUsageCircleProps) {
  const {percentage} = props;
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
  const percentage = context.contextWindow > 0 && context.usedTokens !== null ? (context.usedTokens / context.contextWindow) * 100 : 0;
  const label = `${formatContextTokens(context.usedTokens)} / ${formatTokens(context.contextWindow)} tokens`;

  return (
    <Menu
      align="end"
      className="w-56 overflow-hidden bg-surface-popover backdrop-blur-none"
      sideOffset={10}
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="grid size-7 place-items-center rounded-full p-0 text-ink" title={label} type="button" variant="primary">
          <ContextUsageCircle percentage={percentage} />
        </Button>
      )}
      triggerLabel="Show context usage"
    >
      <div className="space-y-3 p-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm font-medium text-ink-muted/45">Context window</span>
          <span className="shrink-0 text-sm font-medium tabular-nums text-ink">{context.usedTokens === null ? "?" : `${Math.round(percentage)}%`}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-overlay-pressed">
          <div className="h-full rounded-full bg-ink transition-[width] duration-300" style={{width: `${Math.max(0, Math.min(100, percentage))}%`}} />
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
