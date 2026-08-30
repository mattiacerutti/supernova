import {SettingsGroup} from "@/features/settings/components/settings-group";

const availableSkeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6", "row-7", "row-8", "row-9", "row-10"] as const;

function ProviderSkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="size-8 shrink-0 animate-pulse rounded-lg corner-superellipse/1.3 bg-surface-control" />
      <div className="min-w-0 flex-1">
        <span className="block h-4 w-52 max-w-[70%] animate-pulse rounded-full bg-overlay-pressed" />
      </div>
      <span className="h-4 w-16 shrink-0 animate-pulse rounded-full bg-overlay-pressed" />
    </div>
  );
}

export default function ProvidersSkeleton() {
  return (
    <div aria-label="Loading providers" className="space-y-8" role="status">
      <div aria-hidden="true" className="h-10 animate-pulse rounded-xl corner-superellipse/1.3 bg-surface-raised" />
      <div aria-hidden="true">
        <SettingsGroup title="Available">
          {availableSkeletonRows.map((row) => (
            <ProviderSkeletonRow key={row} />
          ))}
        </SettingsGroup>
      </div>
    </div>
  );
}
