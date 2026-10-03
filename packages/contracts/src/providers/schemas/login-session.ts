import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";

/** Text input requested during a provider login flow. */
export const ProviderLoginTextInput = struct({
  /** Human-readable prompt message. */
  message: z.string(),
  /** Optional input placeholder or example value. */
  placeholder: z.string().optional(),
  /** Whether the browser should conceal the entered value. */
  secret: z.boolean().optional(),
});

/** Informational link emitted by a provider-owned authentication flow. */
const ProviderLoginInfoLink = struct({
  label: z.string().optional(),
  url: z.string(),
});

/** Selectable option requested by a provider login flow. */
const ProviderLoginSelectOption = struct({
  /** Optional supporting description displayed below the option label. */
  description: z.string().optional(),
  /** Provider-native option identifier submitted back to the login flow. */
  id: z.string(),
  /** Human-readable option label displayed in the UI. */
  label: z.string(),
});

/** Current user-visible step in a provider login flow. */
export const ProviderLoginStep = z.union([
  /** Login session has been created and is waiting for the first provider callback. */
  struct({type: z.literal("starting")}),
  /** Login flow is processing submitted input or waiting for provider authorization. */
  struct({type: z.literal("authenticating")}),
  /** Provider emitted information while preparing the next authentication step. */
  struct({type: z.literal("info"), links: array(ProviderLoginInfoLink), message: z.string()}),
  /** Login flow needs the user to choose one of several provider-defined options. */
  struct({type: z.literal("select"), message: z.string(), options: array(ProviderLoginSelectOption)}),
  /** Login flow needs the user to complete browser-based authorization. */
  struct({type: z.literal("browser_auth"), authUrl: z.string(), instructions: z.string().optional(), manualInput: ProviderLoginTextInput.optional()}),
  /** Login flow needs the user to enter a device code on a verification page. */
  struct({
    type: z.literal("device_code"),
    /** Seconds until the device code expires, when provided by the provider. */
    expiresInSeconds: z.number().optional(),
    /** Recommended provider polling interval in seconds, when provided by the provider. */
    intervalSeconds: z.number().optional(),
    /** Short code the user must enter on the verification page. */
    userCode: z.string(),
    /** Provider verification URL for device-code login. */
    verificationUri: z.string(),
  }),
  /** Login flow needs free-form text input from the user. */
  struct({type: z.literal("prompt"), input: ProviderLoginTextInput}),
  /** Login completed and credentials were saved. */
  struct({type: z.literal("succeeded")}),
  /** Login failed with a user-visible error. */
  struct({type: z.literal("failed"), error: z.string()}),
  /** Login was cancelled by the user or host application. */
  struct({type: z.literal("cancelled")}),
]);

/** Snapshot of an in-flight provider login session. */
export const ProviderLoginSession = struct({
  /** Stable login session identifier used for submit, cancel, and watch operations. */
  loginSessionId: z.string(),
  /** Provider-supplied progress message, when available. */
  progress: z.string().optional(),
  /** Identifier of the provider being authenticated. */
  providerId: z.string(),
  /** Current user-visible login step. */
  step: ProviderLoginStep,
});

export type ProviderLoginTextInput = z.infer<typeof ProviderLoginTextInput>;
export type ProviderLoginStep = z.infer<typeof ProviderLoginStep>;
export type ProviderLoginSession = z.infer<typeof ProviderLoginSession>;
