import type {ProviderAuthSource} from "@supernova/contracts/providers/schemas";

/** Maps Pi provider auth source values into shared provider auth source values. */
export function normalizeAuthSource(source: string | undefined): ProviderAuthSource | undefined {
  switch (source) {
    case "stored":
    case "runtime":
    case "environment":
      return source;
    case "models_json_key":
    case "models_json_command":
      return "config";
    case "fallback":
      return "external";
    default:
      return source ? "unknown" : undefined;
  }
}
