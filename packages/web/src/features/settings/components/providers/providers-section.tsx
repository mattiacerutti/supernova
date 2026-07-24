import type {Provider} from "@supernova/contracts/providers/schemas";
import ProviderRow from "@/features/settings/components/providers/list/provider-row";

interface ProvidersSectionProps {
  title: string;
  providers: readonly Provider[];
  onConnect: (provider: Provider) => void;
  onDisconnect: (provider: Provider) => Promise<void>;
}

export default function ProvidersSection(props: ProvidersSectionProps) {
  const {onConnect, onDisconnect, providers, title} = props;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-ink-muted">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-border bg-overlay-hover">
        {providers.map((provider, index) => (
          <ProviderRow key={provider.id} isFirst={index === 0} onConnect={onConnect} onDisconnect={onDisconnect} provider={provider} />
        ))}
      </div>
    </section>
  );
}
