# Configuration & Environment Variables

> When to read: pull this in when reading configuration or environment variables via Effect's `Config` module, handling secrets with `Redacted`, providing custom config providers, or validating config values.

```typescript
import { Config, ConfigProvider, Effect, Layer, Redacted } from "effect"

// Basic config values
const port = Config.number("PORT")                    // Required number
const host = Config.string("HOST").pipe(              // Optional with default
  Config.withDefault("localhost")
)

// Sensitive values (masked in logs)
const apiKey = Config.redacted("API_KEY")             // Returns Redacted<string>
const secret = Redacted.value(yield* apiKey)          // Unwrap when needed

// Nested configuration with prefix
const dbConfig = Config.all({
  host: Config.string("HOST"),
  port: Config.number("PORT"),
  name: Config.string("NAME"),
}).pipe(Config.nested("DATABASE"))                    // DATABASE_HOST, DATABASE_PORT, etc.

// Using config in effects
const program = Effect.gen(function* () {
  const p = yield* Config.number("PORT")
  const key = yield* Config.redacted("API_KEY")
  return { port: p, apiKey: Redacted.value(key) }
})

// Custom config provider (e.g., from object instead of env)
const customProvider = ConfigProvider.fromMap(
  new Map([["PORT", "3000"], ["API_KEY", "secret"]])
)
const withCustomConfig = Effect.provide(
  program,
  Layer.setConfigProvider(customProvider)
)

// Config validation and transformation
const validPort = Config.number("PORT").pipe(
  Config.validate({
    message: "Port must be between 1 and 65535",
    validation: (n) => n >= 1 && n <= 65535,
  })
)
```
