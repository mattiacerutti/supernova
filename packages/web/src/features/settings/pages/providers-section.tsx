import {startTransition, useOptimistic, useRef, useState} from "react";
import type {LoginPrompt, LoginState, Provider, ProviderLoginAuthType} from "@supernova/contracts/services/providers/schemas";
import Dialog from "@/components/ui/dialog";
import SearchField from "@/components/ui/search-field";
import ProviderConnectMethodContent from "@/features/settings/components/providers/login/provider-connect-method-content";
import ProviderGroup from "@/features/settings/components/providers/provider-group";
import ProviderLoginContent from "@/features/settings/components/providers/login/provider-login-content";
import ProvidersSkeleton from "@/features/settings/components/providers/providers-skeleton";
import {useProviders} from "@/features/settings/api/providers/providers";
import {showToast} from "@/lib/toast";

const failureMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const loginMethods = (provider: Provider): ProviderLoginAuthType[] => provider.authTypes.filter((type): type is ProviderLoginAuthType => type !== "external");

export default function ProvidersSection() {
  const {answer, cancel, dismiss, login, logout, providers, start} = useProviders();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Provider | undefined>();
  const [open, setOpen] = useState(false);
  const dialogProviderId = useRef<string | undefined>(undefined);
  const [shownLogin, guessLogin] = useOptimistic<LoginState | null, LoginState>(login ?? null, (_current, guess) => guess);
  const providerLogin = selected && shownLogin?.providerId === selected.id ? shownLogin : null;

  const guess = (next: LoginState, call: () => Promise<unknown>, failure: string): void =>
    startTransition(async () => {
      guessLogin(next);
      await call().catch((error: unknown) => showToast(failure, failureMessage(error), {type: "error"}));
    });

  const end = (attemptId: string): void =>
    void cancel({attemptId})
      .then(() => dismiss({attemptId}))
      .catch(() => undefined);

  const startLogin = (provider: Provider, authType: ProviderLoginAuthType): void =>
    guess(
      {attemptId: "", providerId: provider.id, authType, status: "working", prompt: null, notices: []},
      // A start answered after its dialog closed has nobody to finish it.
      () => start({providerId: provider.id, authType}).then(({attemptId}) => dialogProviderId.current !== provider.id && end(attemptId)),
      `Unable to connect ${provider.name}`
    );

  const connect = (provider: Provider): void => {
    const methods = loginMethods(provider);
    dialogProviderId.current = provider.id;
    setSelected(provider);
    setOpen(true);
    if (methods.length === 1) startLogin(provider, methods[0]!);
  };

  const handleAnswer = (prompt: LoginPrompt, value: string): void => {
    if (providerLogin) guess({...providerLogin, prompt: null}, () => answer({attemptId: providerLogin.attemptId, promptId: prompt.id, value}), "Login answer refused");
  };

  // After the close animation, so the dialog keeps its content while it fades.
  const closed = (): void => {
    dialogProviderId.current = undefined;
    if (login && login.providerId === selected?.id) end(login.attemptId);
    setSelected(undefined);
  };

  const handleDisconnect = async (provider: Provider): Promise<void> => {
    await logout({providerId: provider.id}).catch((error: unknown) => showToast(`Unable to disconnect ${provider.name}`, failureMessage(error), {type: "error"}));
  };

  const searchQuery = search.trim().toLowerCase();
  const matchingProviders = providers?.filter((provider) => provider.name.toLowerCase().includes(searchQuery)) ?? [];
  const connectedProviders = matchingProviders.filter((provider) => provider.connected);
  const otherProviders = matchingProviders.filter((provider) => !provider.connected);

  return (
    <>
      {!providers && <ProvidersSkeleton />}
      {providers && (
        <>
          <SearchField className="mx-3 px-0 sm:mx-4" onChange={(event) => setSearch(event.target.value)} placeholder="Search providers" value={search} />

          {matchingProviders.length === 0 && <p className="px-3 text-sm text-ink-faint sm:px-4">No providers match your search.</p>}
          {connectedProviders.length > 0 && <ProviderGroup onConnect={connect} onDisconnect={handleDisconnect} providers={connectedProviders} title="Connected" />}
          {otherProviders.length > 0 && <ProviderGroup onConnect={connect} onDisconnect={handleDisconnect} providers={otherProviders} title="Available" />}

          <Dialog
            containerClassName="h-auto w-[min(calc(100vw-1rem),32rem)]"
            onOpenChange={setOpen}
            onOpenChangeComplete={(next) => {
              if (!next) closed();
            }}
            open={open}
            title={`Connect ${selected?.name ?? "provider"}`}
          >
            {selected && !providerLogin && <ProviderConnectMethodContent methods={loginMethods(selected)} onSelect={(method) => startLogin(selected, method)} />}
            {providerLogin && <ProviderLoginContent login={providerLogin} onAnswer={handleAnswer} onClose={() => setOpen(false)} />}
          </Dialog>
        </>
      )}
    </>
  );
}
