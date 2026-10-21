import {cn} from "@/lib/cn";
import "@/components/ui/shimmer-text.css";

interface ShimmerTextProps {
  readonly children: string;
  readonly className?: string;
}

/** Single-line text with a sweeping highlight, animated on the compositor so it costs no main-thread work per frame. */
export default function ShimmerText(props: ShimmerTextProps) {
  const {children, className} = props;

  return (
    <span className={cn("shimmer-text shimmer-group", className)}>
      {children}
      <span aria-hidden="true" className="shimmer-text-layer shimmer-layer">
        <span className="shimmer-text-copy">{children}</span>
      </span>
      <span aria-hidden="true" className="shimmer-text-layer shimmer-layer shimmer-layer-band">
        <span className="shimmer-text-copy">{children}</span>
      </span>
    </span>
  );
}
