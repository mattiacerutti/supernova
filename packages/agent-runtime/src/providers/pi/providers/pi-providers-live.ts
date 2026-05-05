import {Layer} from "effect";
import {ProvidersService} from "@pi-desktop/agent-runtime/services/providers/providers-service";
import {cancelProviderLogin} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/cancel-provider-login";
import {getProviderLoginSession} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/get-provider-login-session";
import {listProviders} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/list-providers";
import {logoutProvider} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/logout-provider";
import {setProviderApiKey} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/set-provider-api-key";
import {startProviderOAuthLogin} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/start-provider-oauth-login";
import {submitProviderLoginInput} from "@pi-desktop/agent-runtime/providers/pi/providers/operations/submit-provider-login-input";

export const PiProvidersLive = Layer.succeed(ProvidersService, {
  cancelLogin: cancelProviderLogin,
  getLoginSession: getProviderLoginSession,
  list: listProviders,
  logout: logoutProvider,
  setApiKey: setProviderApiKey,
  startOAuthLogin: startProviderOAuthLogin,
  submitLoginInput: submitProviderLoginInput,
});
