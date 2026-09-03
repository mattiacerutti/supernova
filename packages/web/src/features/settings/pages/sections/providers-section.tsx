import {useState} from "react";
import type {Provider} from "@supernova/contracts/providers/schemas";
import Dialog from "@/components/ui/dialog";
import SearchField from "@/components/ui/search-field";
import ProviderConnectMethodContent from "@/features/settings/components/providers/provider-connect-method-content";
import ProviderGroup from "@/features/settings/components/providers/provider-group";
import ProviderLoginContent from "@/features/settings/components/providers/provider-login-content";
import ProvidersSkeleton from "@/features/settings/components/providers/providers-skeleton";
import {useListProviders} from "@/features/settings/hooks/api/providers/use-list-providers";
import {useLogoutProvider} from "@/features/settings/hooks/api/providers/use-logout-provider";
import {useProviderConnectFlow} from "@/features/settings/hooks/providers/use-provider-connect-flow";

export default function ProvidersSection() {
  const providersQuery = useListProviders();
  const logoutMutation = useLogoutProvider();
  const connectFlow = useProviderConnectFlow({
    onLoginDialogClosed: () => {
      void providersQuery.refetch();
    },
  });
  const [search, setSearch] = useState("");

  const handleDisconnect = async (provider: Provider): Promise<void> => {
    await logoutMutation.mutateAsync({providerId: provider.id});
  };

  const searchQuery = search.trim().toLowerCase();
  const matchingProviders = providersQuery.data?.filter((provider) => provider.name.toLowerCase().includes(searchQuery)) ?? [];
  const connectedProviders = matchingProviders.filter((provider) => provider.connected);
  const otherProviders = matchingProviders.filter((provider) => !provider.connected);

  return (
    <>
      {providersQuery.isPending && <ProvidersSkeleton />}
      {providersQuery.error && <p className="px-3 text-sm text-danger-ink sm:px-4">Unable to load providers.</p>}
      {providersQuery.data && (
        <>
          <SearchField className="mx-3 px-0 sm:mx-4" onChange={(event) => setSearch(event.target.value)} placeholder="Search providers" value={search} />

          {matchingProviders.length === 0 && <p className="px-3 text-sm text-ink-faint sm:px-4">No providers match your search.</p>}
          {connectedProviders.length > 0 && <ProviderGroup onConnect={connectFlow.connect} onDisconnect={handleDisconnect} providers={connectedProviders} title="Connected" />}
          {otherProviders.length > 0 && <ProviderGroup onConnect={connectFlow.connect} onDisconnect={handleDisconnect} providers={otherProviders} title="Available" />}

          <Dialog
            containerClassName="h-auto w-[min(calc(100vw-1rem),32rem)]"
            onOpenChange={(open) => {
              if (!open) connectFlow.closeDialog();
            }}
            onOpenChangeComplete={connectFlow.handleDialogOpenChangeComplete}
            open={connectFlow.dialogOpen}
            title={`Connect ${connectFlow.selectedProvider?.name ?? "provider"}`}
          >
            {connectFlow.view === "method" && <ProviderConnectMethodContent onSelect={connectFlow.chooseMethod} pendingMethod={connectFlow.pendingAuthType} />}
            {connectFlow.view === "login" && connectFlow.startLoginError && <p className="pb-4 pt-1 text-sm text-danger-ink">{connectFlow.startLoginError.message}</p>}
            {connectFlow.view === "login" && !connectFlow.startLoginError && (
              <ProviderLoginContent
                initialSession={connectFlow.loginSession}
                key={connectFlow.loginSessionId}
                loginSessionId={connectFlow.loginSessionId}
                onClose={connectFlow.closeDialog}
              />
            )}
          </Dialog>
        </>
      )}
    </>
  );
}
