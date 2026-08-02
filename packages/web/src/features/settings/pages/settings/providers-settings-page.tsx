import {useRef, useState} from "react";
import type {ProviderLoginAuthType} from "@supernova/contracts/providers/procedures";
import type {Provider} from "@supernova/contracts/providers/schemas";
import Dialog from "@/components/ui/dialog";
import ProviderConnectMethodContent from "@/features/settings/components/providers/provider-connect-method-dialog";
import ProviderLoginContent from "@/features/settings/components/providers/provider-login-dialog";
import ProvidersPageSkeleton from "@/features/settings/components/providers/providers-page-skeleton";
import ProvidersSection from "@/features/settings/components/providers/providers-section";
import {useCancelProviderLogin} from "@/features/settings/hooks/api/auth/use-cancel-provider-login";
import {useLogoutProvider} from "@/features/settings/hooks/api/auth/use-logout-provider";
import {useStartProviderLogin} from "@/features/settings/hooks/api/auth/use-start-provider-login";
import {useListProviders} from "@/features/settings/hooks/api/use-list-providers";

type ProviderDialogView = "login" | "method";

export default function ProvidersSettingsPage() {
  const providersQuery = useListProviders();

  const logoutMutation = useLogoutProvider();
  const {data: loginSession, error: startLoginError, isPending: isStartingLogin, mutate: startLoginMutation, reset: resetLoginMutation, variables: pendingLoginInput} = useStartProviderLogin();
  const cancelLoginMutation = useCancelProviderLogin();

  const [selectedProvider, setSelectedProvider] = useState<Provider | undefined>();
  const [providerDialogOpen, setProviderDialogOpen] = useState(false);
  const [providerDialogView, setProviderDialogView] = useState<ProviderDialogView | undefined>();
  const loginSessionId = loginSession?.loginSessionId;
  const pendingCloseRef = useRef<{cancelLogin: boolean; loginSessionId: string | undefined; view: ProviderDialogView | undefined}>({
    cancelLogin: true,
    loginSessionId: undefined,
    view: undefined,
  });

  const handleCloseProviderDialog = (cancelLogin: boolean = true): void => {
    pendingCloseRef.current = {cancelLogin, loginSessionId, view: providerDialogView};
    setProviderDialogOpen(false);
  };

  const handleProviderDialogOpenChangeComplete = (open: boolean): void => {
    if (open) return;

    const pendingClose = pendingCloseRef.current;
    if (pendingClose.view === "login") {
      void providersQuery.refetch();
      if (pendingClose.cancelLogin && pendingClose.loginSessionId) {
        cancelLoginMutation.mutate({loginSessionId: pendingClose.loginSessionId});
      }
    }

    resetLoginMutation();
    setProviderDialogView(undefined);
    setSelectedProvider(undefined);
  };

  const startLogin = (provider: Provider, authType: ProviderLoginAuthType): void => {
    pendingCloseRef.current = {cancelLogin: false, loginSessionId: undefined, view: undefined};
    if (providerDialogView !== "method") setProviderDialogView("login");
    startLoginMutation(
      {authType, providerId: provider.id},
      {
        onError: () => setProviderDialogView("login"),
        onSuccess: (session) => {
          const pendingClose = pendingCloseRef.current;
          if (pendingClose.cancelLogin && !pendingClose.loginSessionId) {
            cancelLoginMutation.mutate({loginSessionId: session.loginSessionId});
            return;
          }
          setProviderDialogView("login");
        },
      }
    );
  };

  const handleDisconnect = async (provider: Provider) => {
    await logoutMutation.mutateAsync({providerId: provider.id});
  };

  const handleConnect = (provider: Provider): void => {
    const hasOAuth = provider.authTypes.includes("oauth");
    const hasApiKey = provider.authTypes.includes("api_key");

    setSelectedProvider(provider);

    if (hasOAuth && hasApiKey) {
      setProviderDialogView("method");
      setProviderDialogOpen(true);
      return;
    }

    if (hasOAuth || hasApiKey) {
      setProviderDialogOpen(true);
      startLogin(provider, hasOAuth ? "oauth" : "api_key");
    }
  };

  const handleConnectMethod = (method: ProviderLoginAuthType): void => {
    if (!selectedProvider) return;
    startLogin(selectedProvider, method);
  };

  const connectedProviders = providersQuery.data?.filter((provider) => provider.connected) ?? [];
  const otherProviders = providersQuery.data?.filter((provider) => !provider.connected) ?? [];

  return (
    <div className="scroll-fade-y min-h-0 flex-1 overflow-y-auto px-6 py-8 md:px-10">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Providers</h1>
        <p className="mt-2 text-sm text-ink-muted">Connect model providers to use them.</p>

        {providersQuery.isPending && <ProvidersPageSkeleton />}
        {providersQuery.error && <p className="mt-8 text-sm text-diff-removed">Unable to load providers.</p>}
        {providersQuery.data && (
          <>
            <div className="mt-10 space-y-10">
              {connectedProviders.length > 0 && <ProvidersSection onConnect={handleConnect} onDisconnect={handleDisconnect} providers={connectedProviders} title="Connected" />}
              <ProvidersSection onConnect={handleConnect} onDisconnect={handleDisconnect} providers={otherProviders} title="Available" />
            </div>

            <Dialog
              containerClassName="h-auto w-[min(calc(100vw-1rem),32rem)]"
              onOpenChange={(open) => {
                if (!open) handleCloseProviderDialog();
              }}
              onOpenChangeComplete={handleProviderDialogOpenChangeComplete}
              open={providerDialogOpen}
              title={`Connect ${selectedProvider?.name ?? "provider"}`}
            >
              {providerDialogView === "method" && (
                <ProviderConnectMethodContent onSelect={handleConnectMethod} pendingMethod={isStartingLogin ? pendingLoginInput?.authType : undefined} />
              )}
              {providerDialogView === "login" && startLoginError && <p className="pb-4 pt-1 text-sm text-diff-removed">{startLoginError.message}</p>}
              {providerDialogView === "login" && !startLoginError && (
                <ProviderLoginContent initialSession={loginSession} key={loginSessionId} loginSessionId={loginSessionId} onClose={handleCloseProviderDialog} />
              )}
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
}
