import type {ReactNode} from "react";
import {cn} from "@/lib/cn";

interface TranscriptBlockProps {
  children: ReactNode;
  className?: string;
  scrollable?: boolean;
}

export default function TranscriptBlock(props: TranscriptBlockProps) {
  const {children, className, scrollable = true} = props;

  return <div className={cn("rounded-xl border border-white/8 bg-neutral-800 text-xs leading-relaxed", scrollable && "max-h-72 overflow-auto", className)}>{children}</div>;
}
