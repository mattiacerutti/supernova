import {randomUUID} from "node:crypto";
import type {
  ProviderLoginCancelPayload,
  ProviderLoginInputSubmitPayload,
  ProviderLoginStartPayload,
  ProviderLoginWatchPayload,
  ProviderLogoutPayload,
  ProviderLogoutResult,
  ProvidersListResult,
} from "@supernova/contracts/providers/procedures";
import {ProviderLoginError} from "@supernova/contracts/providers/procedures";
import type {Provider, ProviderAuthType, ProviderLoginSession} from "@supernova/contracts/providers/schemas";
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
    // Subscribe before the login runs so no step published synchronously by the provider is missed.
    const steps = this.deps.loginSessions.watch(loginSessionId);
    void runProviderLogin(this.deps.sdk, this.deps.loginSessions, loginSessionId, providerId, authType);

    try {
      for await (const session of steps) {
        if (session.step.type !== "starting" && session.step.type !== "authenticating") return session;
      }
    } finally {
      await steps.return(undefined);
    }
    throw new ProviderLoginError({message: "Provider login ended before producing a visible step."});
  }

  public cancelLogin(input: ProviderLoginCancelPayload): ProviderLoginSession {
    return this.deps.loginSessions.cancel(input.loginSessionId);
  }

  public submitLoginInput(input: ProviderLoginInputSubmitPayload): ProviderLoginSession {
    return this.deps.loginSessions.submitInput(input.loginSessionId, input.input);
  }

  public watchLoginSession(input: ProviderLoginWatchPayload): AsyncIterable<ProviderLoginSession> {
    return this.deps.loginSessions.watch(input.loginSessionId);
  }
}
