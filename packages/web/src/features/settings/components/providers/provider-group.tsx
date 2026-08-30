import type {Provider} from "@supernova/contracts/providers/schemas";
import {SettingsGroup} from "@/features/settings/components/settings-group";
import ProviderRow from "@/features/settings/components/providers/provider-row";

interface ProviderGroupProps {
  title: string;
  providers: readonly Provider[];
  onConnect: (provider: Provider) => void;
  onDisconnect: (provider: Provider) => Promise<void>;
}

export default function ProviderGroup(props: ProviderGroupProps) {
  const {onConnect, onDisconnect, providers, title} = props;

  return (
    <SettingsGroup title={title}>
      {providers.map((provider) => (
        <ProviderRow key={provider.id} onConnect={onConnect} onDisconnect={onDisconnect} provider={provider} />
      ))}
    </SettingsGroup>
  );
}
