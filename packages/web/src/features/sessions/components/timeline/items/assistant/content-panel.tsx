import type {ReactNode} from "react";
import {cn} from "@/lib/cn";

interface ContentPanelProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

export default function ContentPanel(props: ContentPanelProps) {
  const {children, className, scrollable = true} = props;

  return (
    <div className={cn("p-3 rounded-xl border border-white/8 bg-neutral-800 text-xs leading-relaxed", scrollable && "max-h-72 overflow-auto overscroll-contain", className)} data-scrollable={scrollable ? true : undefined}>
      {children}
    </div>
  );
}
