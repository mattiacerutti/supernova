import {cn} from "@/lib/cn";

// Stagger columns and outer rows to send a chevron wave across the grid.
const CHEVRON_DELAYS = [
  "[animation-delay:90ms]",
  "[animation-delay:180ms]",
  "[animation-delay:270ms]",
  "[animation-delay:0ms]",
  "[animation-delay:90ms]",
  "[animation-delay:180ms]",
  "[animation-delay:90ms]",
  "[animation-delay:180ms]",
  "[animation-delay:270ms]",
];

export default function MatrixLoader() {
  return (
    <span aria-hidden="true" className="grid shrink-0 grid-cols-3 gap-px">
      {CHEVRON_DELAYS.map((delay, index) => (
        <span
          className={cn(
            "size-0.75 animate-pulse rounded-full bg-current [animation-duration:900ms] [animation-timing-function:ease-in-out] motion-reduce:animate-none motion-reduce:opacity-15",
            delay
          )}
          key={index}
        />
      ))}
    </span>
  );
}
