import type {IAgentProvider} from "@pi-desktop/contracts/providers";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";
import {cn} from "@/lib/cn";
import {useState} from "react";

function getProviderSourceLabel(provider: IAgentProvider): string | undefined {
  if (!provider.connected) return undefined;
  if (provider.source === "stored") return "Connected";
  if (provider.sourceLabel) return provider.sourceLabel;
  if (provider.source === "environment") return "Environment variable";
  if (provider.source === "config") return "Configuration";
  return "Configured externally";
}

interface IProviderRowProps {
  provider: IAgentProvider;
  isFirst: boolean;
  onConnect: (provider: IAgentProvider) => void;
  onDisconnect: (provider: IAgentProvider) => Promise<void>;
}

export default function ProviderRow(props: IProviderRowProps) {
  const {isFirst, onConnect, onDisconnect, provider} = props;

  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const sourceLabel = getProviderSourceLabel(provider);
  const canConnect = provider.authTypes.some((authType) => authType === "api_key" || authType === "oauth");

  const handleDisconnect = async (): Promise<void> => {
    setIsDisconnecting(true);
    await onDisconnect(provider);
    setIsDisconnecting(false);
  };

  return (
    <div className={cn("flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/3", !isFirst && "border-t border-white/7")}>
      <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/7 text-neutral-400">
        <Icon name="server" size="sm" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutral-200">{provider.name}</p>
        {sourceLabel && <p className="truncate text-xs text-neutral-600">{sourceLabel}</p>}
      </div>
      {provider.connected && (
        <Button className="w-auto shrink-0 px-3 text-xs" disabled={!provider.disconnectable || isDisconnecting} onClick={handleDisconnect} size="sm" variant="primary">
          {isDisconnecting ? "Disconnecting..." : provider.disconnectable ? "Disconnect" : "Managed externally"}
        </Button>
      )}
      {!provider.connected && (
        <Button className="w-auto shrink-0 px-3 text-xs" disabled={!canConnect} onClick={() => onConnect(provider)} size="sm" variant="primary">
          {canConnect ? "Connect" : "Configure externally"}
        </Button>
      )}
    </div>
  );
}
