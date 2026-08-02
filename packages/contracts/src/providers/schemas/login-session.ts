import {Schema} from "effect";

/** Text input requested during a provider login flow. */
export const ProviderLoginTextInput = Schema.Struct({
  /** Human-readable prompt message. */
  message: Schema.String,
  /** Optional input placeholder or example value. */
  placeholder: Schema.optional(Schema.String),
  /** Whether the browser should conceal the entered value. */
  secret: Schema.optional(Schema.Boolean),
});

/** Informational link emitted by a provider-owned authentication flow. */
const ProviderLoginInfoLink = Schema.Struct({
  label: Schema.optional(Schema.String),
  url: Schema.String,
});

/** Selectable option requested by a provider login flow. */
const ProviderLoginSelectOption = Schema.Struct({
  /** Optional supporting description displayed below the option label. */
  description: Schema.optional(Schema.String),
  /** Provider-native option identifier submitted back to the login flow. */
  id: Schema.String,
  /** Human-readable option label displayed in the UI. */
  label: Schema.String,
});

/** Current user-visible step in a provider login flow. */
export const ProviderLoginStep = Schema.Union([
  /** Login session has been created and is waiting for the first provider callback. */
  Schema.Struct({type: Schema.Literal("starting")}),
  /** Login flow is processing submitted input or waiting for provider authorization. */
  Schema.Struct({type: Schema.Literal("authenticating")}),
  /** Provider emitted information while preparing the next authentication step. */
  Schema.Struct({type: Schema.Literal("info"), links: Schema.Array(ProviderLoginInfoLink), message: Schema.String}),
  /** Login flow needs the user to choose one of several provider-defined options. */
  Schema.Struct({type: Schema.Literal("select"), message: Schema.String, options: Schema.Array(ProviderLoginSelectOption)}),
  /** Login flow needs the user to complete browser-based authorization. */
  Schema.Struct({type: Schema.Literal("browser_auth"), authUrl: Schema.String, instructions: Schema.optional(Schema.String), manualInput: Schema.optional(ProviderLoginTextInput)}),
  /** Login flow needs the user to enter a device code on a verification page. */
  Schema.Struct({
    type: Schema.Literal("device_code"),
    /** Seconds until the device code expires, when provided by the provider. */
    expiresInSeconds: Schema.optional(Schema.Number),
    /** Recommended provider polling interval in seconds, when provided by the provider. */
    intervalSeconds: Schema.optional(Schema.Number),
    /** Short code the user must enter on the verification page. */
    userCode: Schema.String,
    /** Provider verification URL for device-code login. */
    verificationUri: Schema.String,
  }),
  /** Login flow needs free-form text input from the user. */
  Schema.Struct({type: Schema.Literal("prompt"), input: ProviderLoginTextInput}),
  /** Login completed and credentials were saved. */
  Schema.Struct({type: Schema.Literal("succeeded")}),
  /** Login failed with a user-visible error. */
  Schema.Struct({type: Schema.Literal("failed"), error: Schema.String}),
  /** Login was cancelled by the user or host application. */
  Schema.Struct({type: Schema.Literal("cancelled")}),
]);

/** Snapshot of an in-flight provider login session. */
export const ProviderLoginSession = Schema.Struct({
  /** Stable login session identifier used for submit, cancel, and watch operations. */
  loginSessionId: Schema.String,
  /** Provider-supplied progress message, when available. */
  progress: Schema.optional(Schema.String),
  /** Identifier of the provider being authenticated. */
  providerId: Schema.String,
  /** Current user-visible login step. */
  step: ProviderLoginStep,
});

export type ProviderLoginTextInput = typeof ProviderLoginTextInput.Type;
export type ProviderLoginStep = typeof ProviderLoginStep.Type;
export type ProviderLoginSession = typeof ProviderLoginSession.Type;
