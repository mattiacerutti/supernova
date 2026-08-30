import {useRef, useState} from "react";
import type {ProviderLoginAuthType} from "@supernova/contracts/providers/procedures";
import type {Provider} from "@supernova/contracts/providers/schemas";
import {useCancelProviderLogin} from "@/features/settings/hooks/api/providers/use-cancel-provider-login";
import {useStartProviderLogin} from "@/features/settings/hooks/api/providers/use-start-provider-login";

export type ProviderConnectView = "login" | "method";

interface PendingClose {
  cancelLogin: boolean;
  loginSessionId: string | undefined;
  view: ProviderConnectView | undefined;
}

interface UseProviderConnectFlowOptions {
  onLoginDialogClosed: () => void;
}

/**
 * Owns the provider connect dialog flow: method selection, login start,
 * and cancellation of in-flight logins when the dialog closes.
 */
export function useProviderConnectFlow(options: UseProviderConnectFlowOptions) {
  const {onLoginDialogClosed} = options;

  const {
    data: loginSession,
    error: startLoginError,
    isPending: isStartingLogin,
    mutate: startLoginMutation,
    reset: resetLoginMutation,
    variables: pendingLoginInput,
  } = useStartProviderLogin();
  const cancelLoginMutation = useCancelProviderLogin();

  const [selectedProvider, setSelectedProvider] = useState<Provider | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<ProviderConnectView | undefined>();
  const loginSessionId = loginSession?.loginSessionId;
  const pendingCloseRef = useRef<PendingClose>({cancelLogin: true, loginSessionId: undefined, view: undefined});

  const closeDialog = (cancelLogin: boolean = true): void => {
    pendingCloseRef.current = {cancelLogin, loginSessionId, view};
    setDialogOpen(false);
  };

  const handleDialogOpenChangeComplete = (open: boolean): void => {
    if (open) return;

    const pendingClose = pendingCloseRef.current;
    if (pendingClose.view === "login") {
      onLoginDialogClosed();
      if (pendingClose.cancelLogin && pendingClose.loginSessionId) {
        cancelLoginMutation.mutate({loginSessionId: pendingClose.loginSessionId});
      }
    }

    resetLoginMutation();
    setView(undefined);
    setSelectedProvider(undefined);
  };

  const startLogin = (provider: Provider, authType: ProviderLoginAuthType): void => {
    pendingCloseRef.current = {cancelLogin: false, loginSessionId: undefined, view: undefined};
    if (view !== "method") setView("login");
    startLoginMutation(
      {authType, providerId: provider.id},
      {
        onError: () => setView("login"),
        onSuccess: (session) => {
          const pendingClose = pendingCloseRef.current;
          if (pendingClose.cancelLogin && !pendingClose.loginSessionId) {
            cancelLoginMutation.mutate({loginSessionId: session.loginSessionId});
            return;
          }
          setView("login");
        },
      }
    );
  };

  const connect = (provider: Provider): void => {
    const hasOAuth = provider.authTypes.includes("oauth");
    const hasApiKey = provider.authTypes.includes("api_key");

    setSelectedProvider(provider);

    if (hasOAuth && hasApiKey) {
      setView("method");
      setDialogOpen(true);
      return;
    }

    if (hasOAuth || hasApiKey) {
      setDialogOpen(true);
      startLogin(provider, hasOAuth ? "oauth" : "api_key");
    }
  };

  const chooseMethod = (method: ProviderLoginAuthType): void => {
    if (!selectedProvider) return;
    startLogin(selectedProvider, method);
  };

  return {
    chooseMethod,
    closeDialog,
    connect,
    dialogOpen,
    handleDialogOpenChangeComplete,
    loginSession,
    loginSessionId,
    pendingAuthType: isStartingLogin ? pendingLoginInput?.authType : undefined,
    selectedProvider,
    startLoginError,
    view,
  };
}
