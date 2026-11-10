import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {forbidden, isOwner} from "@supernova/agent-runtime/lib/chord/principals";
import {following} from "@supernova/agent-runtime/lib/chord/state";
import type {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import type {Providers} from "@supernova/agent-runtime/features/providers/providers";

export function providersFacet(providers: Providers, loginSessions: LoginSessions): Facet<RuntimePrincipal> {
  const loginsNow = (): ProviderLoginsState => ({logins: Object.fromEntries(loginSessions.all().map((session) => [session.loginSessionId, session]))});

  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(ProvidersService, (_params, principal, self) => {
      if (!isOwner(principal)) throw forbidden("Only the owner manages providers.");

      const logins = following(self, loginsNow, (changed) => loginSessions.onAnyChange(changed));

      return {
        variant: "owner",
        members: {
          logins: logins.member,
          list: action(() => providers.list()),
          logout: method((input) => providers.logout(input)),
          startLogin: method((input) => providers.startLogin(input)),
          submitLoginInput: method((input) => providers.submitLoginInput(input)),
          cancelLogin: method((input) => providers.cancelLogin(input)),
        },
      };
    });
  });
}
