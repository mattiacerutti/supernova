import {Schema} from "effect";

/** Authentication methods a provider can support. */
export const ProviderAuthType = Schema.Union([Schema.Literal("api_key"), Schema.Literal("oauth"), Schema.Literal("external")]);

/** Origin of the active provider credential or configuration. */
export const ProviderAuthSource = Schema.Union([
  Schema.Literal("stored"),
  Schema.Literal("environment"),
  Schema.Literal("config"),
  Schema.Literal("runtime"),
  Schema.Literal("external"),
  Schema.Literal("unknown"),
]);

/** Provider authentication status and available connection methods. */
export const Provider = Schema.Struct({
  /** Stable provider identifier. */
  id: Schema.String,
  /** Human-readable provider name. */
  name: Schema.String,
  /** Source of the active provider credential or configuration, when known. */
  source: Schema.optional(ProviderAuthSource),
  /** Human-readable source label, such as an environment variable name. */
  sourceLabel: Schema.optional(Schema.String),
  /** Authentication methods available for this provider. */
  authTypes: Schema.Array(ProviderAuthType),
  /** Whether the provider currently has usable authentication. */
  connected: Schema.Boolean,
  /** Whether Supernova can remove the active provider credential. */
  disconnectable: Schema.Boolean,
});

export type ProviderAuthType = typeof ProviderAuthType.Type;
export type ProviderAuthSource = typeof ProviderAuthSource.Type;
export type Provider = typeof Provider.Type;
