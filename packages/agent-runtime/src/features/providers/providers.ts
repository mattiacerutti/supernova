import {randomUUID} from "node:crypto";
import type {
  ProviderLoginCancelPayload,
  ProviderLoginInputSubmitPayload,
  ProviderLoginStartPayload,
  ProviderLogoutPayload,
  ProviderLogoutResult,
  ProvidersListResult,
} from "@supernova/contracts/services/providers/procedures";
import {ProviderLoginError} from "@supernova/contracts/services/providers/procedures";
import type {Provider, ProviderAuthType, ProviderLoginSession} from "@supernova/contracts/services/providers/schemas";
import {normalizeAuthSource} from "@supernova/agent-runtime/features/providers/lib/auth-source";
import {runProviderLogin} from "@supernova/agent-runtime/features/providers/login/commands/run-login";
import type {LoginSessions} from "@supernova/agent-runtime/features/providers/login/login-sessions";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface ProvidersDeps {
  readonly loginSessions: LoginSessions;
  readonly sdk: Pick<PiSdk, "modelRuntime">;
}

/** Model providers and their login flows. */
export class Providers {
  public constructor(private readonly deps: ProvidersDeps) {}

  /** Every login's current step as replicated state, for clients following one. */
  public get logins() {
    return this.deps.loginSessions.logins;
  }

  /** Lists configured and configurable Pi providers with auth metadata. */
  public async list(): Promise<ProvidersListResult> {
    const {modelRuntime} = this.deps.sdk;
    await modelRuntime.refresh({allowNetwork: false});
    const storedProviderIds = new Set((await modelRuntime.listCredentials()).map((credential) => credential.providerId));

    return modelRuntime
      .getProviders()
      .map<Provider>((provider) => {
        const status = modelRuntime.getProviderAuthStatus(provider.id);
        const authTypes: ProviderAuthType[] = [];
        if (provider.auth.apiKey?.login) authTypes.push("api_key");
        else if (provider.auth.apiKey) authTypes.push("external");
        if (provider.auth.oauth) authTypes.push("oauth");

        return {
          id: provider.id,
          name: provider.name,
          source: normalizeAuthSource(status.source),
          sourceLabel: status.label,
          authTypes,
          connected: status.configured,
          disconnectable: storedProviderIds.has(provider.id),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /** Removes stored credentials for a provider and refreshes model auth state. */
  public async logout(input: ProviderLogoutPayload): Promise<ProviderLogoutResult> {
    await this.deps.sdk.modelRuntime.logout(input.providerId);
    return {providerId: input.providerId};
  }

  /** Starts a provider-owned login in the background and returns once it shows its first step. */
  public async startLogin(input: ProviderLoginStartPayload): Promise<ProviderLoginSession> {
    const {authType, providerId} = input;
    const provider = this.deps.sdk.modelRuntime.getProvider(providerId);
    const auth = authType === "oauth" ? provider?.auth.oauth : provider?.auth.apiKey;
    if (!auth?.login) throw new ProviderLoginError({message: `Provider does not support ${authType === "oauth" ? "OAuth" : "API key"} login.`});

    const loginSessionId = randomUUID();
    this.deps.loginSessions.create({loginSessionId, providerId});
    // Listen before the login runs so no step published synchronously by the provider is missed.
    let stop: () => void = () => undefined;
    const visible = new Promise<ProviderLoginSession>((resolve) => {
      stop = this.deps.loginSessions.onChange(loginSessionId, (session) => {
        if (session.step.type !== "starting" && session.step.type !== "authenticating") resolve(session);
      });
    });
    // The login ends on a visible step (succeeded, failed, cancelled) even when it shows none before.
    void runProviderLogin(this.deps.sdk, this.deps.loginSessions, loginSessionId, providerId, authType);
    try {
      return await visible;
    } finally {
      stop();
    }
  }

  public cancelLogin(input: ProviderLoginCancelPayload): ProviderLoginSession {
    return this.deps.loginSessions.cancel(input.loginSessionId);
  }

  public submitLoginInput(input: ProviderLoginInputSubmitPayload): ProviderLoginSession {
    return this.deps.loginSessions.submitInput(input.loginSessionId, input.input);
  }
}
