import type {ProviderLoginAuthType} from "@supernova/contracts/providers/procedures";
import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";

interface ProviderConnectMethodContentProps {
  onSelect: (method: ProviderLoginAuthType) => void;
  pendingMethod?: ProviderLoginAuthType;
}

export default function ProviderConnectMethodContent(props: ProviderConnectMethodContentProps) {
  const {onSelect, pendingMethod} = props;

  return (
    <div className="space-y-3 pb-4 pt-1">
      <p className="text-sm text-ink-muted">Select a connection method</p>
      <div className="-ml-3 -mr-3 space-y-0.5">
        <Button
          className="flex w-full items-center justify-between gap-2 rounded-xl corner-superellipse/1.3 px-3 py-2 text-left hover:bg-overlay-hover"
          disabled={pendingMethod !== undefined}
          onClick={() => onSelect("oauth")}
          variant="bare"
        >
          <Icon name="user" size="sm" />
          <span className="flex-1 text-sm text-ink">Use a subscription</span>
          <Icon className={pendingMethod === "oauth" ? "animate-spin text-ink-muted" : "text-ink-muted"} name={pendingMethod === "oauth" ? "loader" : "arrow-right"} size="xs" />
        </Button>
        <Button
          className="flex w-full items-center justify-between gap-2 rounded-xl corner-superellipse/1.3 px-3 py-2 text-left hover:bg-overlay-hover"
          disabled={pendingMethod !== undefined}
          onClick={() => onSelect("api_key")}
          variant="bare"
        >
          <Icon name="key" size="sm" />
          <span className="flex-1 text-sm text-ink">Use an API key</span>
          <Icon
            className={pendingMethod === "api_key" ? "animate-spin text-ink-muted" : "text-ink-muted"}
            name={pendingMethod === "api_key" ? "loader" : "arrow-right"}
            size="xs"
          />
        </Button>
      </div>
    </div>
  );
}
