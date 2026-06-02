# Testing

## Table of Contents

- [Setup](#setup)
- [Basic Testing](#basic-testing)
- [Test Function Variants](#test-function-variants)
- [Providing Layers](#providing-layers)
- [TestClock](#testclock)
- [Test Modifiers](#test-modifiers)
- [Logging in Tests](#logging-in-tests)
- [Worked Example](#worked-example)

## Setup

Install:

```bash
bun add -D vitest @effect/vitest@beta
```

Config:

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
})
```

```json
// package.json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

## Basic Testing

Import from `@effect/vitest`, not `vitest`:

```typescript
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"

describe("Calculator", () => {
  it("sync test", () => {
    expect(1 + 1).toBe(2)
  })

  it.effect("effect test", () =>
    Effect.gen(function* () {
      const result = yield* Effect.succeed(1 + 1)
      expect(result).toBe(2)
    })
  )
})
```

## Test Function Variants

### it.effect

Most common. Provides TestContext (TestClock, TestRandom). Clock starts at 0:

```typescript
it.effect("processes data", () =>
  Effect.gen(function* () {
    const result = yield* processData("input")
    expect(result).toBe("expected")
  })
)
```

### it.live

Uses real system clock. Use when you need actual delays or real time:

```typescript
it.live("real clock", () =>
  Effect.gen(function* () {
    const now = yield* Clock.currentTimeMillis
    expect(now).toBeGreaterThan(0) // actual system time
  })
)
```

### Scoped Resources

Scoping is automatic in v4. The scope closes when the test ends:

```typescript
it.effect("temp directory cleaned up", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const tempDir = yield* fs.makeTempDirectoryScoped()
    yield* fs.writeFileString(`${tempDir}/test.txt`, "hello")
    expect(yield* fs.exists(`${tempDir}/test.txt`)).toBe(true)
    // scope closes, tempDir is deleted
  }).pipe(Effect.provide(NodeFileSystem.layer))
)
```

## Providing Layers

Use `Effect.provide` inline per test:

```typescript
const testDatabase = Layer.succeed(Database, {
  query: (_sql) => Effect.succeed(["mock", "data"]),
})

it.effect("queries database", () =>
  Effect.gen(function* () {
    const db = yield* Database
    const results = yield* db.query("SELECT *")
    expect(results.length).toBe(2)
  }).pipe(Effect.provide(testDatabase))
)
```

## TestClock

`it.effect` provides TestClock automatically. Use `TestClock.adjust` to simulate time:

```typescript
import { TestClock } from "effect/testing"

it.effect("time-based test", () =>
  Effect.gen(function* () {
    const fiber = yield* Effect.delay(Effect.succeed("done"), "10 seconds").pipe(
      Effect.forkChild
    )
    yield* TestClock.adjust("10 seconds")
    const result = yield* Fiber.join(fiber)
    expect(result).toBe("done")
  })
)
```

## Test Modifiers

```typescript
it.effect.skip("temporarily disabled", () => /* ... */)
it.effect.only("focus on this", () => /* ... */)
it.effect.fails("known bug, expected to fail", () => /* ... */)
```

## Logging in Tests

By default, `it.effect` suppresses log output:

```typescript
// Option 1: provide a logger
it.effect("with logging", () =>
  Effect.gen(function* () {
    yield* Effect.log("visible")
  }).pipe(Effect.provide(Logger.pretty))
)

// Option 2: it.live enables logging by default
it.live("live with logging", () =>
  Effect.gen(function* () {
    yield* Effect.log("visible")
  })
)
```

## Worked Example

Testing the Events service from [services-and-layers.md](services-and-layers.md#service-driven-development):

### Test layers with in-memory state

```typescript
import { Clock, Effect, Layer, Option, Schema, ServiceMap } from "effect"
import { describe, expect, it } from "@effect/vitest"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type
const EventId = Schema.String.pipe(Schema.brand("EventId"))
type EventId = typeof EventId.Type
const TicketId = Schema.String.pipe(Schema.brand("TicketId"))
type TicketId = typeof TicketId.Type
const RegistrationId = Schema.String.pipe(Schema.brand("RegistrationId"))
type RegistrationId = typeof RegistrationId.Type

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

class Email extends Schema.Class("Email")({
  to: Schema.String, subject: Schema.String, body: Schema.String,
}) {}

class UserNotFound extends Schema.TaggedErrorClass("UserNotFound")(
  "UserNotFound", { id: UserId }
) {}

// Test layers with mutable in-memory state
class Users extends ServiceMap.Service<Users, {
  readonly create: (user: User) => Effect.Effect<void>
  readonly findById: (id: UserId) => Effect.Effect<User, UserNotFound>
}>()("@app/Users") {
  static readonly testLayer = Layer.sync(Users, () => {
    const store = new Map<UserId, User>()
    const create = (user: User) => Effect.sync(() => void store.set(user.id, user))
    const findById = (id: UserId) =>
      Option.fromNullishOr(store.get(id)).pipe(
        Effect.fromOption,
        Effect.catch(() => Effect.fail(new UserNotFound({ id })))
      )
    return { create, findById }
  })
}

class Tickets extends ServiceMap.Service<Tickets, {
  readonly issue: (eventId: EventId, userId: UserId) => Effect.Effect<Ticket>
}>()("@app/Tickets") {
  static readonly testLayer = Layer.sync(Tickets, () => {
    let counter = 0
    const issue = (eventId: EventId, _userId: UserId) =>
      Effect.sync(() => new Ticket({
        id: TicketId.makeUnsafe(`ticket-${counter++}`),
        eventId, code: `CODE-${counter}`,
      }))
    return { issue }
  })
}

class Emails extends ServiceMap.Service<Emails, {
  readonly send: (email: Email) => Effect.Effect<void>
  readonly sent: Effect.Effect<ReadonlyArray<Email>>
}>()("@app/Emails") {
  static readonly testLayer = Layer.sync(Emails, () => {
    const emails: Array<Email> = []
    const send = (email: Email) => Effect.sync(() => void emails.push(email))
    const sent = Effect.sync(() => emails)
    return { send, sent }
  })
}
```

### The orchestration service

```typescript
class Events extends ServiceMap.Service<Events, {
  readonly register: (eventId: EventId, userId: UserId) => Effect.Effect<Registration, UserNotFound>
}>()("@app/Events") {
  static readonly layer = Layer.effect(Events, Effect.gen(function* () {
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
        yield* emails.send(new Email({
          to: user.email,
          subject: "Event Registration Confirmed",
          body: `Your ticket code: ${ticket.code}`,
        }))
        return registration
      }
    )
    return { register }
  }))
}
```

### Tests

```typescript
// provideMerge exposes leaf services for setup/assertions
const testLayer = Events.layer.pipe(
  Layer.provideMerge(Users.testLayer),
  Layer.provideMerge(Tickets.testLayer),
  Layer.provideMerge(Emails.testLayer),
)

describe("Events.register", () => {
  it.effect("creates registration with correct data", () =>
    Effect.gen(function* () {
      const users = yield* Users
      const events = yield* Events

      const user = new User({
        id: UserId.makeUnsafe("user-123"),
        name: "Alice", email: "alice@example.com",
      })
      yield* users.create(user)

      const eventId = EventId.makeUnsafe("event-789")
      const registration = yield* events.register(eventId, user.id)

      expect(registration.eventId).toBe(eventId)
      expect(registration.userId).toBe(user.id)
    }).pipe(Effect.provide(testLayer))
  )

  it.effect("sends confirmation email with ticket code", () =>
    Effect.gen(function* () {
      const users = yield* Users
      const events = yield* Events
      const emails = yield* Emails

      const user = new User({
        id: UserId.makeUnsafe("user-456"),
        name: "Bob", email: "bob@example.com",
      })
      yield* users.create(user)

      yield* events.register(EventId.makeUnsafe("event-789"), user.id)

      const sentEmails = yield* emails.sent
      expect(sentEmails).toHaveLength(1)
      expect(sentEmails[0].to).toBe("bob@example.com")
      expect(sentEmails[0].subject).toBe("Event Registration Confirmed")
      expect(sentEmails[0].body).toContain("CODE-")
    }).pipe(Effect.provide(testLayer))
  )
})
```

## Testing Errors with Effect.flip

Swap the success/error channels to assert on errors:

```typescript
it.effect("rejects invalid input", () =>
  Effect.gen(function* () {
    const service = yield* MyService
    const error = yield* service.process(badInput).pipe(Effect.flip)
    expect(error._tag).toBe("ValidationError")
  }).pipe(Effect.provide(testLayer))
)
```

## Test Isolation with FiberRef

Avoid mutating `process.env` in parallel tests. Use FiberRef for fiber-local overrides:

```typescript
import { Effect, FiberRef } from "effect"

// In your module
const ConfigOverride = FiberRef.unsafeMake<string | undefined>(undefined)

const getConfig = Effect.gen(function* () {
  const override = yield* FiberRef.get(ConfigOverride)
  if (override !== undefined) return override
  return process.env.MY_CONFIG ?? "/default/path"
})

// In tests: fiber-local, safe for parallel execution
it.effect("works with custom config", () =>
  Effect.gen(function* () {
    const result = yield* myEffect
    expect(result).toBe(expected)
  }).pipe(
    Effect.locally(ConfigOverride, "/test/path"), // scoped to this fiber
    Effect.provide(TestLayer),
  )
)
```

**Why FiberRef over process.env mutation:**
- Fiber-local (parallel test safe)
- Auto-cleanup (no finally block needed)
- Type-safe

Patterns adapted from [artimath/effect-skills](https://github.com/artimath/effect-skills) (MIT).

## Running Tests

```bash
bun run test                          # all tests
bun run test:watch                    # watch mode
bunx vitest run tests/user.test.ts    # specific file
bunx vitest run -t "UserService"      # matching pattern
```
