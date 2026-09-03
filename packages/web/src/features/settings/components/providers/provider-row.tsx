import type {Provider} from "@supernova/contracts/providers/schemas";
import Button from "@/components/ui/button";
import {useState} from "react";

const actionChipClassName =
  "w-auto shrink-0 rounded-xl bg-overlay-pressed px-3 py-1.5 text-xs text-ink hover:bg-overlay-strong hover:text-ink-strong disabled:hover:bg-overlay-pressed disabled:hover:text-ink";

function getProviderSourceLabel(provider: Provider): string | undefined {
  if (!provider.connected) return undefined;
  if (provider.source === "stored") return "Connected";
  if (provider.sourceLabel) return provider.sourceLabel;
  if (provider.source === "environment") return "Environment variable";
  if (provider.source === "config") return "Configuration";
  return "Configured externally";
}

interface ProviderRowProps {
  provider: Provider;
  onConnect: (provider: Provider) => void;
  onDisconnect: (provider: Provider) => Promise<void>;
}

export default function ProviderRow(props: ProviderRowProps) {
  const {onConnect, onDisconnect, provider} = props;

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const sourceLabel = getProviderSourceLabel(provider);
  const canConnect = provider.authTypes.some((authType) => authType === "api_key" || authType === "oauth");

  const handleDisconnect = async (): Promise<void> => {
    setIsDisconnecting(true);
    await onDisconnect(provider);
    setIsDisconnecting(false);
  };

  const action = provider.connected
    ? {
        disabled: !provider.disconnectable || isDisconnecting,
        label: isDisconnecting ? "Disconnecting..." : provider.disconnectable ? "Disconnect" : "Managed externally",
        onClick: handleDisconnect,
      }
    : {
        disabled: !canConnect,
        label: canConnect ? "Connect" : "Configure externally",
        onClick: () => onConnect(provider),
      };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
      <div className="grid size-8 shrink-0 place-items-center rounded-lg corner-superellipse/1.3 bg-surface-control text-sm font-medium text-ink-muted">
        {provider.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink-strong">{provider.name}</p>
        {sourceLabel && (
          <p className="flex items-center gap-1.5 truncate text-xs text-ink-faint">
            <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-diff-added" />
            {sourceLabel}
          </p>
        )}
      </div>
      <Button className={actionChipClassName} disabled={action.disabled} onClick={action.onClick} size="sm" variant="primary">
        {action.label}
      </Button>
    </div>
  );
}
