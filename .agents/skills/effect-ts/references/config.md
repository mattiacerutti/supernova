# Config

## Table of Contents

- [How Config Works](#how-config-works)
- [Basic Usage](#basic-usage)
- [Config Service Pattern](#config-service-pattern)
- [Config Primitives](#config-primitives)
- [Defaults and Fallbacks](#defaults-and-fallbacks)
- [Validation with Schema](#validation-with-schema)
- [Config Providers](#config-providers)
- [Redacted Secrets](#redacted-secrets)

## How Config Works

By default, `Config` reads from environment variables. Override with `ConfigProvider`:
- **Production**: environment variables (default)
- **Tests**: in-memory maps or `Layer.succeed` with test values
- **Development**: JSON files or hardcoded values

## Basic Usage

```typescript
import { Config, Effect } from "effect"

const program = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("API_KEY")
  const port = yield* Config.int("PORT")
  console.log(`Starting on port ${port}`)
})
```

Override the provider:

```typescript
import { ConfigProvider, Layer } from "effect"

const testConfigLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({ API_KEY: "test-key", PORT: "3000" })
)

Effect.runPromise(program.pipe(Effect.provide(testConfigLayer)))
```

## Config Service Pattern

**Best practice:** Create a config service with `layer` and `testLayer`:

```typescript
import { Config, Effect, Layer, Redacted, ServiceMap } from "effect"

class ApiConfig extends ServiceMap.Service<
  ApiConfig,
  {
    readonly apiKey: Redacted.Redacted
    readonly baseUrl: string
    readonly timeout: number
  }
>()("@app/ApiConfig") {
  static readonly layer = Layer.effect(
    ApiConfig,
    Effect.gen(function* () {
      const apiKey = yield* Config.redacted("API_KEY")
      const baseUrl = yield* Config.string("API_BASE_URL").pipe(
        Config.orElse(() => Config.succeed("https://api.example.com"))
      )
      const timeout = yield* Config.int("API_TIMEOUT").pipe(
        Config.orElse(() => Config.succeed(30000))
      )
      return { apiKey, baseUrl, timeout }
    })
  )

  // Tests: inline values, no ConfigProvider needed
  static readonly testLayer = Layer.succeed(ApiConfig, {
    apiKey: Redacted.make("test-key"),
    baseUrl: "https://test.example.com",
    timeout: 5000,
  })
}
```

**Why this pattern:**
- Separates config loading from business logic
- Easy to swap implementations (layer vs testLayer)
- Config errors caught early at layer composition
- Type-safe throughout your app

For tests, just `Layer.succeed` with hardcoded values. No need for `ConfigProvider.fromMap`.

## Config Primitives

```typescript
Config.string("MY_VAR")           // string
Config.number("PORT")             // number
Config.int("MAX_RETRIES")         // integer
Config.boolean("DEBUG")           // boolean
Config.redacted("API_KEY")        // hidden in logs
Config.url("API_URL")             // URL
Config.duration("TIMEOUT")        // Duration
Config.array(Config.string(), "TAGS") // comma-separated array
```

## Defaults and Fallbacks

```typescript
// With orElse
const port = yield* Config.int("PORT").pipe(
  Config.orElse(() => Config.succeed(3000))
)

// Optional values (returns Option<string>)
const optionalKey = yield* Config.option(Config.string("OPTIONAL_KEY"))
```

## Validation with Schema

Use `Config.schema` for type-safe validation:

```typescript
import { Config, Schema } from "effect"

const Port = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  Schema.brand("Port")
)
type Port = typeof Port.Type

const Environment = Schema.Literals(["development", "staging", "production"])

const program = Effect.gen(function* () {
  const port = yield* Config.schema(Port, "PORT")     // branded Port
  const env = yield* Config.schema(Environment, "ENV") // validated enum
})
```

## Config Providers

```typescript
import { ConfigProvider, Layer } from "effect"

// From object
ConfigProvider.layer(ConfigProvider.fromUnknown({ API_KEY: "key", PORT: "3000" }))

// From JSON
ConfigProvider.layer(ConfigProvider.fromJson({ API_KEY: "key", PORT: 8080 }))

// Prefixed env vars (reads APP_API_KEY, APP_PORT, etc.)
ConfigProvider.layer(ConfigProvider.fromEnv().pipe(ConfigProvider.nested("APP")))
```

## Redacted Secrets

Always use `Config.redacted()` for sensitive values:

```typescript
import { Config, Redacted } from "effect"

const program = Effect.gen(function* () {
  const apiKey = yield* Config.redacted("API_KEY")

  // Extract value when needed
  const headers = { Authorization: `Bearer ${Redacted.value(apiKey)}` }

  // Hidden in logs
  console.log(apiKey) // Output: <redacted>
})
```

Use `Schema.Redacted(Schema.String)` in config schemas:

```typescript
class DatabaseConfig extends ServiceMap.Service<
  DatabaseConfig,
  { readonly host: string; readonly port: number; readonly password: Redacted.Redacted }
>()("@app/DatabaseConfig") {
  static readonly layer = Layer.effect(DatabaseConfig, Effect.gen(function* () {
    const host = yield* Config.schema(Schema.String, "DB_HOST")
    const port = yield* Config.schema(Port, "DB_PORT")
    const password = yield* Config.schema(Schema.Redacted(Schema.String), "DB_PASSWORD")
    return { host, port, password }
  }))
}
```
