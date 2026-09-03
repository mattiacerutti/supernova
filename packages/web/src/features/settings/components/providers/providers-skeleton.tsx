import {SettingsGroup} from "@/features/settings/components/settings-group";

const availableSkeletonRows = ["row-1", "row-2", "row-3", "row-4", "row-5", "row-6", "row-7", "row-8", "row-9", "row-10"] as const;

function ProviderSkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
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
    <div aria-label="Loading providers" className="flex flex-col gap-12" role="status">
      <div aria-hidden="true" className="mx-3 flex items-center gap-2.5 border-b border-border-muted py-2.5 sm:mx-4">
        <span className="size-4.5 shrink-0 animate-pulse rounded-full bg-overlay-pressed" />
        <span className="h-4 w-36 animate-pulse rounded-full bg-overlay-pressed" />
      </div>
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
