import {Schema} from "effect";

/** Startup preferences for a new session; explicit selections and resumed sessions take precedence. */
export const ModelDefaults = Schema.Struct({
  providerId: Schema.optional(Schema.String),
  modelId: Schema.optional(Schema.String),
  thinkingLevel: Schema.optional(Schema.Literals(["off", "minimal", "low", "medium", "high", "xhigh", "max"])),
});

/** Effective configuration safe to expose to clients. Backend-only settings never cross this boundary. */
export const Configuration = Schema.Struct({
  modelDefaults: ModelDefaults,
});

export type ModelDefaults = typeof ModelDefaults.Type;
export type Configuration = typeof Configuration.Type;
