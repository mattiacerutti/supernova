import {useState} from "react";
import type {Provider} from "@pi-desktop/contracts/providers/schemas";
import Dialog from "@/components/ui/dialog";
import ProviderApiKeyContent from "@/features/settings/components/providers/provider-api-key-dialog";
import ProviderConnectMethodContent from "@/features/settings/components/providers/provider-connect-method-dialog";
import ProviderOAuthLoginContent from "@/features/settings/components/providers/provider-oauth-login-dialog";
import ProviderSection from "@/features/settings/components/providers/provider-section";
import {useCancelProviderLogin} from "@/features/settings/hooks/api/auth/use-cancel-provider-login";
import {useLogoutProvider} from "@/features/settings/hooks/api/auth/use-logout-provider";
import {useStartProviderOAuthLogin} from "@/features/settings/hooks/api/auth/use-start-provider-oauth-login";
import {useListProviders} from "@/features/settings/hooks/api/use-list-providers";

type ConnectMethod = "api_key" | "oauth";
type ProviderDialogView = "api_key" | "method" | "oauth";

export default function ProvidersSettingsPage() {
  const providersQuery = useListProviders();

  const logoutMutation = useLogoutProvider();
  const {isPending: isStartingOAuthLogin, data: loginSession, mutateAsync: startOAuthLoginMutation} = useStartProviderOAuthLogin();
  const cancelLoginMutation = useCancelProviderLogin();

  const [selectedProvider, setSelectedProvider] = useState<Provider | undefined>();
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerDialogView, setProviderDialogView] = useState<ProviderDialogView | undefined>();
  const loginSessionId = loginSession?.loginSessionId;

  const handleCloseProviderDialog = (cancelLogin: boolean = true): void => {
    setProviderDialogOpen(false);
    const shouldRefetchProviders = providerDialogView === "oauth";

    if (shouldRefetchProviders) {
      void providersQuery.refetch();
    }

    // Delay login cancellation to allow the dialog to close smoothly without jank.
    window.setTimeout(() => {
      if (cancelLogin && providerDialogView === "oauth" && loginSessionId) {
        cancelLoginMutation.mutate({loginSessionId});
      }
    }, 300);
  };

  const startOAuthLogin = async (provider: Provider) => {
    await startOAuthLoginMutation({providerId: provider.id});
    setProviderDialogView("oauth");
  };

  const handleDisconnect = async (provider: Provider) => {
    await logoutMutation.mutateAsync({providerId: provider.id});
  };

  const handleConnect = async (provider: Provider) => {
    const hasOAuth = provider.authTypes.includes("oauth");
    const hasApiKey = provider.authTypes.includes("api_key");

    setSelectedProvider(provider);

    if (hasOAuth && hasApiKey) {
      setProviderDialogView("method");
      setProviderDialogOpen(true);
      return;
    }

    if (hasOAuth) {
      setProviderDialogOpen(true);
      startOAuthLogin(provider);
      return;
    }

    if (hasApiKey) {
      setProviderDialogView("api_key");
      setProviderDialogOpen(true);
    }
  };

  const handleConnectMethod = (method: ConnectMethod): void => {
    if (!selectedProvider) return;

    if (method === "oauth") {
      startOAuthLogin(selectedProvider);
    } else {
      setProviderDialogView("api_key");
    }
  };

  const connectedProviders = providersQuery.data?.filter((provider) => provider.connected) ?? [];
  const otherProviders = providersQuery.data?.filter((provider) => !provider.connected) ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-neutral-200">Providers</h1>
        <p className="mt-2 text-sm text-neutral-500">Connect model providers to use them.</p>

        {providersQuery.isPending && <p className="mt-8 text-sm text-neutral-500">Loading providers...</p>}
        {providersQuery.error && <p className="mt-8 text-sm text-red-400">Unable to load providers.</p>}
        {providersQuery.data && (
          <>
            <div className="mt-10 space-y-10">
              {connectedProviders.length > 0 && <ProviderSection onConnect={handleConnect} onDisconnect={handleDisconnect} providers={connectedProviders} title="Connected" />}
              <ProviderSection onConnect={handleConnect} onDisconnect={handleDisconnect} providers={otherProviders} title="Available" />
            </div>

            <Dialog
              containerClassName="h-auto w-[min(calc(100vw-1rem),32rem)]"
              onOpenChange={(open) => {
                if (!open) handleCloseProviderDialog();
              }}
              open={providerDialogOpen}
              title={`Connect ${selectedProvider?.name ?? "provider"}`}
            >
              {providerDialogView === "method" && <ProviderConnectMethodContent onSelect={handleConnectMethod} isStartingOAuthLogin={isStartingOAuthLogin} />}
              {providerDialogView === "api_key" && <ProviderApiKeyContent onClose={handleCloseProviderDialog} provider={selectedProvider} />}
              {providerDialogView === "oauth" && <ProviderOAuthLoginContent loginSessionId={loginSessionId} onClose={handleCloseProviderDialog} />}
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
}
