import {z} from "zod";
import {array, struct} from "@supernova/contracts/runtime/schemas";

/** Authentication methods a provider can support. */
export const ProviderAuthType = z.union([z.literal("api_key"), z.literal("oauth"), z.literal("external")]);

/** Origin of the active provider credential or configuration. */
export const ProviderAuthSource = z.union([z.literal("stored"), z.literal("environment"), z.literal("config"), z.literal("runtime"), z.literal("external"), z.literal("unknown")]);

/** Provider authentication status and available connection methods. */
export const Provider = struct({
  /** Stable provider identifier. */
  id: z.string(),
  /** Human-readable provider name. */
  name: z.string(),
  /** Source of the active provider credential or configuration, when known. */
  source: ProviderAuthSource.optional(),
  /** Human-readable source label, such as an environment variable name. */
  sourceLabel: z.string().optional(),
  /** Authentication methods available for this provider. */
  authTypes: array(ProviderAuthType),
  /** Whether the provider currently has usable authentication. */
  connected: z.boolean(),
  /** Whether Supernova can remove the active provider credential. */
  disconnectable: z.boolean(),
});

export type ProviderAuthType = z.infer<typeof ProviderAuthType>;
export type ProviderAuthSource = z.infer<typeof ProviderAuthSource>;
export type Provider = z.infer<typeof Provider>;
