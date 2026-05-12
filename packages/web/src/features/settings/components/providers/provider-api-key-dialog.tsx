import {useState} from "react";
import type {FormEvent} from "react";
import type {IAgentProvider} from "@pi-desktop/contracts/providers/schemas";
import Button from "@/components/ui/button";
import Input from "@/components/ui/input";
import {useSetProviderApiKey} from "@/features/settings/hooks/api/auth/use-set-provider-api-key";

interface IProviderApiKeyContentProps {
  onClose: () => void;
  provider?: IAgentProvider;
}

export default function ProviderApiKeyContent(props: IProviderApiKeyContentProps) {
  const {onClose, provider} = props;
  const [apiKey, setApiKey] = useState("");
  const setApiKeyMutation = useSetProviderApiKey();

  const handleClose = (): void => {
    setApiKey("");
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!provider) return;

    setApiKeyMutation.mutate(
      {apiKey, providerId: provider.id},
      {
        onSuccess: () => {
          setApiKey("");
          onClose();
        },
      }
    );
  };

  return (
    <form className="space-y-4 pb-4 pt-1" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-neutral-300" htmlFor="api-key-input">
          API key
        </label>
        <Input autoFocus id="api-key-input" onChange={(event) => setApiKey(event.target.value)} placeholder="Paste your API key" type="password" value={apiKey} />
      </div>
      {setApiKeyMutation.error && <p className="text-sm text-red-400">{setApiKeyMutation.error.message}</p>}
      <div className="flex justify-end gap-2">
        <Button className="w-auto px-3 text-xs" onClick={handleClose} size="sm" variant="primary">
          Cancel
        </Button>
        <Button className="w-auto px-3 text-xs" disabled={setApiKeyMutation.isPending || apiKey.trim().length === 0} size="sm" type="submit" variant="primary">
          {setApiKeyMutation.isPending ? "Connecting..." : "Connect"}
        </Button>
      </div>
    </form>
  );
}
