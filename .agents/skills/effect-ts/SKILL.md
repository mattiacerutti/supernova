---
name: effect-ts
description: "Write idiomatic Effect v4 TypeScript following official best practices from effect-solutions and the Effect source. Use when writing, reviewing, or refactoring Effect code: services (ServiceMap.Service), layers and dependency injection, error handling (Schema.TaggedErrorClass), data modeling (Schema.Class, branded types, variants), testing (@effect/vitest), HTTP clients (effect/unstable/http), CLI tools (effect/unstable/cli), config, observability, and project setup. Triggers on: 'Effect', 'effect-ts', '@effect/', 'Schema', 'ServiceMap', 'Layer', 'Effect.gen', 'Effect.fn', 'TaggedError', 'branded types', or any Effect-TS related code."
---

# Effect-TS (v4)

Patterns from [effect-solutions](https://github.com/kitlangton/effect-solutions) and the [Effect source](https://github.com/Effect-TS/effect-smol). This covers the latest v4 APIs.

## Source-First Rule

When working in any repo that uses Effect (`effect` or `@effect/*` in package/dependency files), reference the official Effect source before writing, reviewing, or refactoring Effect code. Do not rely on stale memory, blog posts, or high-level docs alone.

- First check for the effect source mirror at `.context/effect-smol/` and the effect-solutions code code mirror at `.context/effect-solutions/`.
- If any of them are missing, return an error to the user with details and end the conversation. Do not attempt to answer from memory.

## References

- **Effect mirror** (canonical for current work): `.context/effect-smol/`
- **effect-solutions mirror** (best practices, docs, examples): `.context/effect-solutions/`
- Search the mirrors for current patterns and APIs, especially under `.context/effect-smol/packages/effect/src/` and package tests/examples, before calling something an Effect best practice.

## Effect.gen and Effect.fn

`Effect.gen` provides sequential, readable composition (like async/await for Effect):

```typescript
import {Effect} from "effect";

const program = Effect.gen(function* () {
  const data = yield* fetchData;
  yield* Effect.logInfo(`Processing: ${data}`);
  return yield* processData(data);
});
```

`Effect.fn` adds call-site tracing and named spans. Use for all service methods:

```typescript
const processUser = Effect.fn("processUser")(function* (userId: string) {
  yield* Effect.logInfo(`Processing user ${userId}`);
  const user = yield* getUser(userId);
  return yield* processData(user);
});

// Second argument for cross-cutting concerns (retry, timeout)
const fetchWithRetry = Effect.fn("fetchWithRetry")(
  function* (url: string) {
    const data = yield* fetchData(url);
    return yield* processData(data);
  },
  flow(Effect.retry(Schedule.recurs(3)), Effect.timeout("5 seconds"))
);
```

## ServiceMap.Service

Define services as classes with a unique tag and typed interface:

```typescript
import {Effect, ServiceMap} from "effect";

class Database extends ServiceMap.Service<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>;
    readonly execute: (sql: string) => Effect.Effect<void>;
  }
>()("@app/Database") {}
```

Implement with `Layer.effect` or `Layer.sync`, using `Effect.fn` for all methods:

```typescript
import {Effect, Layer} from "effect";

class Users extends ServiceMap.Service<
  Users,
  {
    readonly findById: (id: UserId) => Effect.Effect<User, UserNotFoundError>;
    readonly all: () => Effect.Effect<readonly User[]>;
  }
>()("@app/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient;
      const findById = Effect.fn("Users.findById")(function* (id: UserId) {
        const response = yield* http.get(`/users/${id}`);
        return yield* HttpClientResponse.schemaBodyJson(User)(response);
      });
      const all = Effect.fn("Users.all")(function* () {
        const response = yield* http.get("/users");
        return yield* HttpClientResponse.schemaBodyJson(Schema.Array(User))(response);
      });
      return {findById, all};
    })
  );
}
```

**Rules:**

- Tag identifiers must be unique. Use `@app/ServiceName` pattern
- Service methods should have `R = never` (dependencies via Layer, not method signatures)
- Use `readonly` properties

See [references/services-and-layers.md](references/services-and-layers.md) for service-driven development, test layers, layer memoization, and full composition patterns.

## Schema.Class and Branded Types

Use `Schema.Class` for domain records. Brand all entity IDs and domain primitives:

```typescript
import {Schema} from "effect";

const UserId = Schema.String.pipe(Schema.brand("UserId"));
type UserId = typeof UserId.Type;

const Email = Schema.String.pipe(Schema.brand("Email"));
type Email = typeof Email.Type;

class User extends Schema.Class("User")({
  id: UserId,
  name: Schema.String,
  email: Email,
  createdAt: Schema.Date,
}) {
  get displayName() {
    return `${this.name} (${this.email})`;
  }
}

// Construct with makeUnsafe for brands
const userId = UserId.makeUnsafe("user-123");
```

Use `Schema.TaggedClass` + `Schema.Union` for variants (OR types):

```typescript
import {Match, Schema} from "effect";

class Success extends Schema.TaggedClass("Success")("Success", {
  value: Schema.Number,
}) {}
class Failure extends Schema.TaggedClass("Failure")("Failure", {
  error: Schema.String,
}) {}
const Result = Schema.Union([Success, Failure]);
type Result = typeof Result.Type;

// Exhaustive pattern matching
const render = (r: Result) =>
  Match.valueTags(r, {
    Success: ({value}) => `Got: ${value}`,
    Failure: ({error}) => `Error: ${error}`,
  });
```

See [references/data-modeling.md](references/data-modeling.md) for JSON encoding, Schema.Literals, validation, and full patterns.

## Schema.TaggedErrorClass

Define domain errors with `Schema.TaggedErrorClass`. They are yieldable (no `Effect.fail` needed):

```typescript
import {Schema} from "effect";

class UserNotFoundError extends Schema.TaggedErrorClass("UserNotFoundError")("UserNotFoundError", {userId: UserId, message: Schema.String}) {}

// Yieldable: yield directly in generators
const getUser = Effect.fn("getUser")(function* (id: UserId) {
  const user = yield* findUser(id);
  if (!user) yield* new UserNotFoundError({userId: id, message: "Not found"});
  return user;
});
```

Recover with `catchTag` / `catchTags`:

```typescript
// Single tag
const recovered = program.pipe(Effect.catchTag("UserNotFoundError", (e) => Effect.succeed(`User ${e.userId} missing`)));

// Multiple tags
const recovered2 = program.pipe(
  Effect.catchTags({
    UserNotFoundError: (e) => Effect.succeed("not found"),
    ValidationError: (e) => Effect.succeed("invalid"),
  })
);
```

See [references/error-handling.md](references/error-handling.md) for defects, Schema.Defect, and recovery patterns.

## Layer Composition

Compose layers with `Layer.provideMerge` (incremental, flat types) and `Layer.merge` (parallel):

```typescript
import {Effect, Layer} from "effect";

// Compose layers for the app
const appLayer = UserService.layer.pipe(Layer.provideMerge(DatabaseLayer), Layer.provideMerge(LoggerLayer), Layer.provideMerge(ConfigLayer));

// Provide once at the entry point
const main = program.pipe(Effect.provide(appLayer));
Effect.runPromise(main);
```

**Key rules:**

- Store parameterized layers in constants (layer memoization by reference identity)
- Provide once at app entry, not scattered throughout code
- Use `Layer.sync` for synchronous implementations, `Layer.effect` for effectful ones

## Testing Quick Start

```typescript
import {describe, expect, it} from "@effect/vitest";
import {Effect, Layer} from "effect";

it.effect("queries database", () =>
  Effect.gen(function* () {
    const db = yield* Database;
    const results = yield* db.query("SELECT *");
    expect(results.length).toBe(2);
  }).pipe(Effect.provide(Database.testLayer))
);
```

- Use `it.effect` for Effect-based tests (provides TestContext with TestClock)
- Use `it.live` for real time / real clock
- Provide fresh layers per test to prevent state leakage
- Use `it.layer` only when sharing expensive resources across a suite

See [references/testing.md](references/testing.md) for the full worked example and advanced patterns.

## Pipe for Instrumentation

```typescript
const program = fetchData.pipe(
  Effect.timeout("5 seconds"),
  Effect.retry(Schedule.exponential("100 millis").pipe(Schedule.compose(Schedule.recurs(3)))),
  Effect.tap((data) => Effect.logInfo(`Fetched: ${data}`)),
  Effect.withSpan("fetchData")
);
```

## Anti-Patterns

| Do Not                                        | Do Instead                                               |
| --------------------------------------------- | -------------------------------------------------------- |
| `console.log(...)`                            | `Effect.log(...)` with structured data                   |
| `process.env.KEY`                             | `Config.string("KEY")` or `Config.redacted("KEY")`       |
| `throw new Error()` inside `Effect.gen`       | `yield* new TaggedError({...})` or `Effect.fail(...)`    |
| `Effect.runSync(...)` inside services         | Keep everything effectful                                |
| `Effect.catchAll(() => ...)` losing type info | `Effect.catchTag` / `Effect.catchTags`                   |
| `null` / `undefined` in domain types          | `Option<T>` with `Option.match`                          |
| `Option.getOrThrow(...)`                      | `Option.match({ onNone, onSome })` or `Option.getOrElse` |
| `Effect.Service` (v3)                         | `ServiceMap.Service` (v4)                                |
| `Schema.TaggedError<T>()` (v3)                | `Schema.TaggedErrorClass("Tag")("Tag", {...})` (v4)      |
| Scatter `Effect.provide` calls                | Provide once at app entry                                |
| Call parameterized layer constructors inline  | Store layers in constants (memoization)                  |

## Reference Files

Load these as needed for deeper patterns:

- **[Services & Layers](references/services-and-layers.md)**: ServiceMap.Service, service-driven development, test layers, layer memoization, provide vs provideMerge
- **[Data Modeling](references/data-modeling.md)**: Schema.Class, branded types, variants, Match.valueTags, JSON encoding
- **[Schema Decisions](references/schema-decisions.md)**: Schema.Class vs Struct vs TaggedClass decision flowchart, migration patterns
- **[Error Handling](references/error-handling.md)**: Schema.TaggedErrorClass, catch/catchTag/catchTags, defects, Schema.Defect, TypeId/refail patterns
- **[Testing](references/testing.md)**: @effect/vitest setup, it.effect/it.live/it.layer, TestClock, Effect.flip, FiberRef isolation, worked example
- **[HTTP Clients](references/http-clients.md)**: HttpClient, request building, response decoding, middleware, retries, typed API service
- **[CLI](references/cli.md)**: Command.make, Arguments, Flags, subcommands, worked task manager example
- **[Config](references/config.md)**: Config module, schema validation, ConfigProvider, Redacted, config layers
- **[Processes & Scopes](references/processes.md)**: Fork types, Scope.extend, Command for child processes, killable background tasks
