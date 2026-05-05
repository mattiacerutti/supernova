import Button from "@/components/ui/button";
import Icon from "@/components/ui/icon";

type ConnectMethod = "api_key" | "oauth";

interface IProviderConnectMethodContentProps {
  onSelect: (method: ConnectMethod) => void;
  isStartingOAuthLogin: boolean;
}

export default function ProviderConnectMethodContent(props: IProviderConnectMethodContentProps) {
  const {onSelect, isStartingOAuthLogin} = props;

  return (
    <div className="space-y-1 pb-4 pt-1">
      <Button onClick={() => onSelect("oauth")} size="sm" variant="ghost" disabled={isStartingOAuthLogin}>
        <Icon name="user" size="sm" />
        <span className="flex-1">Use a subscription</span>
        {isStartingOAuthLogin && <Icon className="animate-spin" name="loader" size="xs" />}
      </Button>
      <Button onClick={() => onSelect("api_key")} size="sm" variant="ghost">
        <Icon name="key" size="sm" />
        <span className="flex-1">Use an API key</span>
      </Button>
    </div>
  );
}
