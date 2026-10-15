import {z} from "zod";

/** `external` means credentials are managed outside Pi (environment, config, or a provider SDK) and cannot be entered here. */
export const ProviderAuthType = z.union([z.literal("api_key"), z.literal("oauth"), z.literal("external")]);

export const ProviderAuthSource = z.union([z.literal("stored"), z.literal("environment"), z.literal("config"), z.literal("runtime"), z.literal("external"), z.literal("unknown")]);

export const Provider = z.object({
  id: z.string(),
  name: z.string(),
  source: ProviderAuthSource.optional(),
  /** Where the credential comes from, for display: an environment variable name, "OAuth token", … */
  sourceLabel: z.string().optional(),
  authTypes: z.array(ProviderAuthType),
  connected: z.boolean(),
  /** Only credentials Pi stores can be removed; environment and config ones cannot. */
  disconnectable: z.boolean(),
});

export type ProviderAuthType = z.infer<typeof ProviderAuthType>;
export type ProviderAuthSource = z.infer<typeof ProviderAuthSource>;
export type Provider = z.infer<typeof Provider>;
