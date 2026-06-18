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
      <circle className="stroke-white/10" cx="10" cy="10" fill="none" r={CIRCLE_RADIUS} strokeWidth="2" />
      <circle
        className="stroke-neutral-200 transition-[stroke-dashoffset] duration-300"
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
      className="w-48 rounded-2xl pt-3"
      sideOffset={10}
      trigger={(triggerProps) => (
        <Button {...triggerProps} className="grid size-7 place-items-center rounded-full p-0 text-neutral-300" title={label} type="button" variant="primary">
          <ContextUsageCircle percentage={percentage} />
        </Button>
      )}
      triggerLabel="Show context usage"
    >
      <div className="px-2 pb-2 text-sm text-neutral-500">Context</div>
      <div className="space-y-1 px-2 pb-2 text-sm">
        <div className="flex items-center justify-between gap-3 py-1 text-neutral-500">
          <span>Used</span>
          <span className="font-medium text-neutral-200">{formatContextTokens(context.usedTokens)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-1 text-neutral-500">
          <span>Window</span>
          <span className="font-medium text-neutral-200">{formatTokens(context.contextWindow)}</span>
        </div>
        <div className="flex items-center justify-between gap-3 py-1 text-neutral-500">
          <span>Usage</span>
          <span className="font-medium text-neutral-200">{context.usedTokens === null ? "?" : `${Math.round(percentage)}%`}</span>
        </div>
      </div>
    </Menu>
  );
}
