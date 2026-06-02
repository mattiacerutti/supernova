# Services & Layers

## Table of Contents

- [ServiceMap.Service](#servicemapservice)
- [Layer Implementations](#layer-implementations)
- [Service-Driven Development](#service-driven-development)
- [Test Implementations](#test-implementations)
- [Providing Layers](#providing-layers)
- [Layer Memoization](#layer-memoization)
- [Sharing Layers Between Tests](#sharing-layers-between-tests)

## ServiceMap.Service

Define services with `ServiceMap.Service` as a class declaring a unique identifier and typed interface:

```typescript
import { Effect, ServiceMap } from "effect"

class Database extends ServiceMap.Service<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>
    readonly execute: (sql: string) => Effect.Effect<void>
  }
>()("@app/Database") {}

class Logger extends ServiceMap.Service<
  Logger,
  {
    readonly log: (message: string) => Effect.Effect<void>
  }
>()("@app/Logger") {}
```

**Rules:**
- Tag identifiers must be unique. Use `@app/ServiceName` or `@path/to/ServiceName`
- Service methods should have no dependencies (`R = never`). Dependencies are handled via Layer composition
- Use `readonly` properties

## Layer Implementations

Use `Layer.effect` for effectful implementations and `Layer.sync` for synchronous ones:

```typescript
import { Effect, Layer, Schema, ServiceMap } from "effect"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

class User extends Schema.Class("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
}) {}

class UserNotFoundError extends Schema.TaggedErrorClass("UserNotFoundError")(
  "UserNotFoundError",
  { id: UserId }
) {}

class Analytics extends ServiceMap.Service<
  Analytics,
  { readonly track: (event: string, data: Record<string, unknown>) => Effect.Effect<void> }
>()("@app/Analytics") {}

class Users extends ServiceMap.Service<
  Users,
  {
    readonly findById: (id: UserId) => Effect.Effect<User, UserNotFoundError>
    readonly all: () => Effect.Effect<readonly User[]>
  }
>()("@app/Users") {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const analytics = yield* Analytics

      const findById = Effect.fn("Users.findById")(
        function* (id: UserId) {
          yield* analytics.track("user.find", { id })
          const response = yield* http.get(`https://api.example.com/users/${id}`)
          return yield* HttpClientResponse.schemaBodyJson(User)(response)
        },
        Effect.catchTag("ResponseError", (error) =>
          error.response.status === 404
            ? new UserNotFoundError({ id })
            : Effect.die(error)
        ),
      )

      const all = Effect.fn("Users.all")(function* () {
        const response = yield* http.get("https://api.example.com/users")
        return yield* HttpClientResponse.schemaBodyJson(Schema.Array(User))(response)
      })

      return { findById, all }
    })
  )
}
```

**Layer naming:** camelCase with descriptive suffix: `layer`, `testLayer`, `postgresLayer`, `sqliteLayer`.

## Service-Driven Development

Sketch leaf service tags first (no implementations). This lets you write and type-check higher-level orchestration before leaf services are runnable:

```typescript
import { Clock, Effect, Layer, Schema, ServiceMap } from "effect"

const RegistrationId = Schema.String.pipe(Schema.brand("RegistrationId"))
type RegistrationId = typeof RegistrationId.Type
const EventId = Schema.String.pipe(Schema.brand("EventId"))
type EventId = typeof EventId.Type
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type
const TicketId = Schema.String.pipe(Schema.brand("TicketId"))
type TicketId = typeof TicketId.Type

class User extends Schema.Class("User")({
  id: UserId, name: Schema.String, email: Schema.String,
}) {}

class Registration extends Schema.Class("Registration")({
  id: RegistrationId, eventId: EventId, userId: UserId,
  ticketId: TicketId, registeredAt: Schema.Date,
}) {}

class Ticket extends Schema.Class("Ticket")({
  id: TicketId, eventId: EventId, code: Schema.String,
}) {}

// Leaf services: contracts only, no implementations yet
class Users extends ServiceMap.Service<
  Users,
  { readonly findById: (id: UserId) => Effect.Effect<User> }
>()("@app/Users") {}

class Tickets extends ServiceMap.Service<
  Tickets,
  { readonly issue: (eventId: EventId, userId: UserId) => Effect.Effect<Ticket> }
>()("@app/Tickets") {}

class Emails extends ServiceMap.Service<
  Emails,
  { readonly send: (to: string, subject: string, body: string) => Effect.Effect<void> }
>()("@app/Emails") {}

// Higher-level service: orchestrates leaf services
class Events extends ServiceMap.Service<
  Events,
  { readonly register: (eventId: EventId, userId: UserId) => Effect.Effect<Registration> }
>()("@app/Events") {
  static readonly layer = Layer.effect(
    Events,
    Effect.gen(function* () {
      const users = yield* Users
      const tickets = yield* Tickets
      const emails = yield* Emails

      const register = Effect.fn("Events.register")(
        function* (eventId: EventId, userId: UserId) {
          const user = yield* users.findById(userId)
          const ticket = yield* tickets.issue(eventId, userId)
          const now = yield* Clock.currentTimeMillis

          const registration = new Registration({
            id: RegistrationId.makeUnsafe(crypto.randomUUID()),
            eventId, userId, ticketId: ticket.id,
            registeredAt: new Date(now),
          })

          yield* emails.send(
            user.email,
            "Event Registration Confirmed",
            `Your ticket code: ${ticket.code}`
          )

          return registration
        }
      )

      return { register }
    })
  )
}
```

This code compiles and type-checks even though leaf services have no implementations yet. Adding production layers later does not change Events code.

## Test Implementations

Use `Layer.sync` with in-memory state for test layers. Mutable state is fine in tests (JS is single-threaded):

```typescript
class Database extends ServiceMap.Service<
  Database,
  {
    readonly query: (sql: string) => Effect.Effect<unknown[]>
    readonly execute: (sql: string) => Effect.Effect<void>
  }
>()("@app/Database") {
  static readonly testLayer = Layer.sync(Database, () => {
    const records: Record<string, unknown> = {
      "user-1": { id: "user-1", name: "Alice" },
    }
    const query = (sql: string) => Effect.succeed(Object.values(records))
    const execute = (sql: string) => Console.log(`Test execute: ${sql}`)
    return { query, execute }
  })
}
```

## Providing Layers

Provide once at the app entry point. Do not scatter `Effect.provide` calls:

```typescript
// Compose all layers
const appLayer = userServiceLayer.pipe(
  Layer.provideMerge(databaseLayer),
  Layer.provideMerge(loggerLayer),
  Layer.provideMerge(configLayer),
)

// Program uses services freely
const program = Effect.gen(function* () {
  const users = yield* UserService
  const logger = yield* Logger
  yield* logger.info("Starting...")
  yield* users.getUser()
})

// Provide once
const main = program.pipe(Effect.provide(appLayer))
Effect.runPromise(main)
```

**Why provide once:**
- Clear dependency graph in one place
- Easy testing: swap `appLayer` for `testLayer`
- No hidden dependencies
- Simpler refactoring

## Layer.provide vs Layer.provideMerge vs Layer.mergeAll

This causes most Effect type errors. Know the difference:

| Method | Deps Satisfied | Available to Program | Use When |
|--------|---------------|---------------------|----------|
| `Layer.provide` | Yes | No | Internal layer building (hide implementation detail) |
| `Layer.provideMerge` | Yes | Yes | Tests needing multiple services, incremental composition |
| `Layer.mergeAll` | No | Yes | Combining independent layers at the same level |

```typescript
// Layer.provide: satisfies deps, hides the provider
const internal = MyService.layer.pipe(Layer.provide(DatabaseLayer))
// Result: Layer<MyService> (Database NOT available to program)

// Layer.provideMerge: satisfies deps AND keeps provider accessible
const test = MyService.layer.pipe(Layer.provideMerge(DatabaseLayer))
// Result: Layer<MyService | Database> (both available)

// Layer.mergeAll: combines without resolving deps
const combined = Layer.mergeAll(UserRepo.layer, OrderRepo.layer)
// Result: Layer<UserRepo | OrderRepo, never, SharedDeps> (deps still required)
```

**Common error to recognize:**
```
Effect<A, E, SomeService> is not assignable to Effect<A, E, never>
```
This means `SomeService` is still required. Use `provideMerge` instead of `provide`.

## Layer Memoization

Effect memoizes layers by reference identity. The same layer instance used multiple times is constructed only once.

```typescript
// BAD: calling constructor twice creates two connection pools
const badLayer = Layer.merge(
  UserRepo.layer.pipe(
    Layer.provide(Postgres.layer({ url: "postgres://...", poolSize: 10 }))
  ),
  OrderRepo.layer.pipe(
    Layer.provide(Postgres.layer({ url: "postgres://...", poolSize: 10 })) // different ref!
  )
)

// GOOD: store in a constant, same reference shared
const postgresLayer = Postgres.layer({ url: "postgres://...", poolSize: 10 })

const goodLayer = Layer.merge(
  UserRepo.layer.pipe(Layer.provide(postgresLayer)),
  OrderRepo.layer.pipe(Layer.provide(postgresLayer)) // same ref
)
```

**Rule:** When using parameterized layer constructors, always store the result in a module-level constant.

## Sharing Layers Between Tests

Default: provide a fresh layer per `it.effect` so state never leaks.

Use `it.layer` only for expensive shared resources (database connections):

```typescript
// Preferred: fresh layer per test
it.effect("starts at zero", () =>
  Effect.gen(function* () {
    const counter = yield* Counter
    expect(yield* counter.get()).toBe(0)
  }).pipe(Effect.provide(Counter.layer))
)

// Shared: only when you need it
it.layer(Counter.layer)("counter", (it) => {
  it.effect("starts at zero", () =>
    Effect.gen(function* () {
      const counter = yield* Counter
      expect(yield* counter.get()).toBe(0)
    })
  )
})
```

See [testing.md](testing.md) for the full worked example.
