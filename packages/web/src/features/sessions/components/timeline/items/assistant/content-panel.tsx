import type {ReactNode} from "react";
import {cn} from "@/lib/cn";

interface ContentPanelProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

export default function ContentPanel(props: ContentPanelProps) {
  const {children, className, scrollable = true} = props;

  if (!scrollable) {
    return <div className={cn("overflow-hidden rounded-xl border border-white/8 bg-neutral-800 p-3 text-xs leading-relaxed", className)}>{children}</div>;
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border border-white/8 bg-neutral-800 text-xs leading-relaxed", className)}>
      <div className="scroll-fade max-h-72 overflow-auto overscroll-contain p-3" data-scrollable>
        {children}
      </div>
    </div>
  );
}
