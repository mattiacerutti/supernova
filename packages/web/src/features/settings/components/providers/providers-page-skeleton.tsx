import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";

const availableSkeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6", "row-7", "row-8", "row-9", "row-10"] as const;

/** Displays a providers-page shaped placeholder while provider data loads. */
export default function ProvidersPageSkeleton() {
  return (
    <div aria-label="Loading providers" className="mt-10" role="status">
      <section aria-hidden="true">
        <h2 className="mb-3 text-sm font-medium text-neutral-400">Available</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/3">
          {availableSkeletonRows.map((row, index) => (
            <ProviderSkeletonRow key={row} isFirst={index === 0} />
          ))}
        </div>
      </section>
    </div>
  );
}

interface ProviderSkeletonRowProps {
  isFirst?: boolean;
}

function ProviderSkeletonRow(props: ProviderSkeletonRowProps) {
  const {isFirst = true} = props;

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3", !isFirst && "border-t border-white/7")}>
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/7 text-neutral-500">
        <Icon name="server" size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="block h-4 w-52 max-w-[70%] animate-pulse rounded-full bg-white/10" />
      </div>
      <span className="h-4 w-16 shrink-0 animate-pulse rounded-full bg-white/10" />
    </div>
  );
}
