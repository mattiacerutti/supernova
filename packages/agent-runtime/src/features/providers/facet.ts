import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {LoginState, Provider} from "@supernova/contracts/services/providers/schemas";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {RuntimeNative} from "@supernova/agent-runtime/core/contract";
import {listProviders} from "@supernova/agent-runtime/features/providers/lib/list-providers";
import {Logins} from "@supernova/agent-runtime/features/providers/natives/logins";
import {method} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf} from "@supernova/agent-runtime/lib/chord/natives";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {derivedState} from "@supernova/agent-runtime/lib/chord/state";

export const providersFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  host.serve(ProvidersService, (_params, principal, self) => {
    if (!isOwner(principal)) throw forbidden("Only the owner manages providers.");

    const natives = nativeOf(self, RuntimeNative);
    const providers = self.writable<readonly Provider[]>([]);
    const login = self.writable<LoginState | null>(null);
    const refresh = async () => providers.set(await listProviders(natives().sdk));

    // No linger: once the providers screen is gone, nothing can answer the login, so its end cancels it.
    const logins = self.open(
      async () => {
        await refresh();
        return new Logins({sdk: natives().sdk, login, credentialsChanged: refresh});
      },
      (opened) => opened.close()
    );

    return {
      variant: "owner",
      members: {
        providers: derivedState(self, [providers], ([value]) => value),
        login: derivedState(self, [login], ([value]) => value),
        start: method(async ({providerId, authType}) => ({attemptId: logins.value.start(providerId, authType)})),
        answer: method(({attemptId, promptId, value}) => logins.value.answer(attemptId, promptId, value)),
        cancel: method(({attemptId}) => logins.value.cancel(attemptId)),
        dismiss: method(({attemptId}) => logins.value.dismiss(attemptId)),
        logout: method(({providerId}) => logins.value.logout(providerId)),
      },
    };
  });
});
