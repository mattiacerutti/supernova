import {z} from "zod";

export const ProviderLoginTextInput = z.object({
  message: z.string(),
  placeholder: z.string().optional(),
  secret: z.boolean().optional(),
});

const ProviderLoginInfoLink = z.object({
  label: z.string().optional(),
  url: z.string(),
});

const ProviderLoginSelectOption = z.object({
  description: z.string().optional(),
  id: z.string(),
  label: z.string(),
});

/** The step a provider login is at; Pi's `AuthInteraction` prompts and notifications, as the client shows them. */
export const ProviderLoginStep = z.union([
  z.object({type: z.literal("starting")}),
  z.object({type: z.literal("authenticating")}),
  z.object({type: z.literal("info"), links: z.array(ProviderLoginInfoLink), message: z.string()}),
  z.object({type: z.literal("select"), message: z.string(), options: z.array(ProviderLoginSelectOption)}),
  /** `manualInput` is set when the user may paste the redirect URL or code instead of completing the browser flow. */
  z.object({type: z.literal("browser_auth"), authUrl: z.string(), instructions: z.string().optional(), manualInput: ProviderLoginTextInput.optional()}),
  z.object({
    type: z.literal("device_code"),
    expiresInSeconds: z.number().optional(),
    intervalSeconds: z.number().optional(),
    userCode: z.string(),
    verificationUri: z.string(),
  }),
  z.object({type: z.literal("prompt"), input: ProviderLoginTextInput}),
  z.object({type: z.literal("succeeded")}),
  z.object({type: z.literal("failed"), error: z.string()}),
  z.object({type: z.literal("cancelled")}),
]);

export const ProviderLoginSession = z.object({
  loginSessionId: z.string(),
  progress: z.string().optional(),
  providerId: z.string(),
  step: ProviderLoginStep,
});

export type ProviderLoginTextInput = z.infer<typeof ProviderLoginTextInput>;
export type ProviderLoginStep = z.infer<typeof ProviderLoginStep>;
export type ProviderLoginSession = z.infer<typeof ProviderLoginSession>;
