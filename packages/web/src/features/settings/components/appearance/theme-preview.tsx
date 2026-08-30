import type {ThemeVariant} from "@/features/settings/lib/themes";
import {cn} from "@/lib/cn";

function withAlpha(color: string, opacity: number): string {
  return `rgb(from ${color} r g b / ${opacity})`;
}

interface ThemePreviewProps {
  className?: string;
  variant: ThemeVariant;
}

export default function ThemePreview(props: ThemePreviewProps) {
  const {className, variant} = props;
  const {accent, ink, surface} = variant.theme;

  return (
    <div aria-hidden="true" className={cn("flex h-full w-full", className)} style={{backgroundColor: surface}}>
      <div className="flex w-[27%] shrink-0 flex-col gap-1 border-r p-1.5" style={{backgroundColor: withAlpha(ink, 0.05), borderColor: withAlpha(ink, 0.1)}}>
        <span className="h-1 w-4/5 rounded-full" style={{backgroundColor: withAlpha(ink, 0.35)}} />
        <span className="h-1 w-3/5 rounded-full" style={{backgroundColor: withAlpha(ink, 0.18)}} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-1.5">
        <span className="h-1 w-3/5 rounded-full" style={{backgroundColor: withAlpha(ink, 0.45)}} />
        <span className="h-1 w-2/5 rounded-full" style={{backgroundColor: withAlpha(ink, 0.2)}} />
        <span className="mt-auto h-1.5 w-1/2 self-end rounded-full" style={{backgroundColor: withAlpha(accent, 0.9)}} />
      </div>
    </div>
  );
}
