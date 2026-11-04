import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {
  ProviderLoginCancelPayload,
  ProviderLoginError,
  ProviderLoginInputSubmitPayload,
  ProviderLoginStartPayload,
  ProviderLogoutPayload,
} from "@supernova/contracts/services/providers/procedures";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {published} from "@supernova/agent-runtime/lib/chord/state";
import type {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import type {Providers} from "@supernova/agent-runtime/features/providers/providers";

export function providersFacet(providers: Providers, loginSessions: LoginSessions): Facet<RuntimePrincipal> {
  const loginsNow = (): ProviderLoginsState => ({logins: Object.fromEntries(loginSessions.all().map((session) => [session.loginSessionId, session]))});
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(ProvidersService, (_params, principal, self) => {
      if (!isOwner(principal)) throw forbidden("Only the owner manages providers.");
      const logins = published(self, loginsNow());
      self.open(
        async () => loginSessions.onAnyChange(() => logins.set(loginsNow())),
        (stop) => stop()
      );
      return {
        variant: "owner",
        members: {
          logins: logins.member,
          list: action({run: () => providers.list()}),
          logout: method({payload: ProviderLogoutPayload, run: (input) => providers.logout(input)}),
          startLogin: method({payload: ProviderLoginStartPayload, run: (input) => providers.startLogin(input), error: ProviderLoginError}),
          submitLoginInput: method({payload: ProviderLoginInputSubmitPayload, run: (input) => providers.submitLoginInput(input), error: ProviderLoginError}),
          cancelLogin: method({payload: ProviderLoginCancelPayload, run: (input) => providers.cancelLogin(input), error: ProviderLoginError}),
        },
      };
    });
  });
}
