import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";

type ConnectMethod = "api_key" | "oauth";

interface ProviderConnectMethodContentProps {
  onSelect: (method: ConnectMethod) => void;
  isStartingOAuthLogin: boolean;
}

export default function ProviderConnectMethodContent(props: ProviderConnectMethodContentProps) {
  const {onSelect, isStartingOAuthLogin} = props;

  return (
    <div className="space-y-3 pb-4 pt-1">
      <p className="text-sm text-neutral-400">Select a connection method</p>
      <div className="-ml-3 -mr-3 space-y-0.5">
        <Button
          className="flex w-full items-center justify-between gap-2 rounded-xl corner-superellipse/1.3 px-3 py-2 text-left hover:bg-white/6"
          disabled={isStartingOAuthLogin}
          onClick={() => onSelect("oauth")}
          variant="bare"
        >
          <Icon name="user" size="sm" />
          <span className="flex-1 text-sm text-neutral-200">Use a subscription</span>
          {isStartingOAuthLogin ? <Icon className="animate-spin text-neutral-500" name="loader" size="xs" /> : <Icon className="text-neutral-500" name="arrow-right" size="xs" />}
        </Button>
        <Button
          className="flex w-full items-center justify-between gap-2 rounded-xl corner-superellipse/1.3 px-3 py-2 text-left hover:bg-white/6"
          onClick={() => onSelect("api_key")}
          variant="bare"
        >
          <Icon name="key" size="sm" />
          <span className="flex-1 text-sm text-neutral-200">Use an API key</span>
          <Icon className="text-neutral-500" name="arrow-right" size="xs" />
        </Button>
      </div>
    </div>
  );
}
