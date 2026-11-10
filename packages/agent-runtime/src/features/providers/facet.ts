import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {RuntimeNative} from "@supernova/agent-runtime/core/contract";
import {ProvidersStore} from "@supernova/agent-runtime/features/providers/contract";
import {LoginSessions} from "@supernova/agent-runtime/features/providers/natives/login-sessions";
import {Providers} from "@supernova/agent-runtime/features/providers/natives/providers";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf} from "@supernova/agent-runtime/lib/chord/natives";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {derivedState} from "@supernova/agent-runtime/lib/chord/state";

export const providersFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  host.serve(ProvidersStore, (_params, self) => {
    const natives = nativeOf(self, RuntimeNative);
    const logins = self.writable<ProviderLoginsState>({logins: {}});

    const providers = self.open(
      async () => new Providers({loginSessions: new LoginSessions(logins), sdk: natives().sdk}),
      () => undefined
    );

    return {
      logins: derivedState(self, [logins], ([value]) => value),
      list: () => providers.value.list(),
      logout: (input) => providers.value.logout(input),
      startLogin: (input) => providers.value.startLogin(input),
      submitLoginInput: async (input) => providers.value.submitLoginInput(input),
      cancelLogin: async (input) => providers.value.cancelLogin(input),
    };
  });

  host.serve(ProvidersService, (_params, principal, self) => {
    if (!isOwner(principal)) throw forbidden("Only the owner manages providers.");

    const providers = self.get(ProvidersStore, {});

    return {
      variant: "owner",
      members: {
        logins: providers.logins,
        list: action((ctx) => providers.list(ctx)),
        logout: method((input, ctx) => providers.logout(input, ctx)),
        startLogin: method((input, ctx) => providers.startLogin(input, ctx)),
        submitLoginInput: method((input, ctx) => providers.submitLoginInput(input, ctx)),
        cancelLogin: method((input, ctx) => providers.cancelLogin(input, ctx)),
      },
    };
  });
});
