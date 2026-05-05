import type {IAgentProvider} from "@pi-desktop/contracts/providers";
import ProviderRow from "@/features/settings/components/providers/provider-row";

interface IProviderSectionProps {
  title: string;
  providers: readonly IAgentProvider[];
  onConnect: (provider: IAgentProvider) => void;
  onDisconnect: (provider: IAgentProvider) => Promise<void>;
}

export default function ProviderSection(props: IProviderSectionProps) {
  const {onConnect, onDisconnect, providers, title} = props;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-neutral-400">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/3">
        {providers.map((provider, index) => (
          <ProviderRow key={provider.id} isFirst={index === 0} onConnect={onConnect} onDisconnect={onDisconnect} provider={provider} />
        ))}
      </div>
    </section>
  );
}
