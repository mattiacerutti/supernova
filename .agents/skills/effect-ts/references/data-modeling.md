# Data Modeling

## Table of Contents

- [Why Schema](#why-schema)
- [Records (AND Types)](#records-and-types)
- [Variants (OR Types)](#variants-or-types)
- [Branded Types](#branded-types)
- [JSON Encoding and Decoding](#json-encoding-and-decoding)
- [Common Schema Primitives](#common-schema-primitives)

## Why Schema

- **Single source of truth**: define once, get TypeScript types + runtime validation + JSON serialization
- **Parse safely**: validate HTTP/CLI/config data with detailed errors
- **Rich domain types**: branded primitives prevent confusion, classes add methods
- **Ecosystem integration**: same schema everywhere (RPC, HttpApi, CLI, frontend, backend)

All representable data composes from two primitives:
- **Records** (AND): a User has a name AND an email AND a createdAt
- **Variants** (OR): a Result is a Success OR a Failure

## Records (AND Types)

Use `Schema.Class` for composite data models:

```typescript
import { Schema } from "effect"

const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

class User extends Schema.Class("User")({
  id: UserId,
  name: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date,
}) {
  get displayName() {
    return `${this.name} (${this.email})`
  }
}

const user = new User({
  id: UserId.makeUnsafe("user-123"),
  name: "Alice",
  email: "alice@example.com",
  createdAt: new Date(),
})
```

## Variants (OR Types)

Simple string/number alternatives with `Schema.Literals`:

```typescript
const Status = Schema.Literals(["pending", "active", "completed"])
type Status = typeof Status.Type // "pending" | "active" | "completed"
```

Structured variants with `Schema.TaggedClass` + `Schema.Union`:

```typescript
import { Match, Schema } from "effect"

class Success extends Schema.TaggedClass("Success")("Success", {
  value: Schema.Number,
}) {}

class Failure extends Schema.TaggedClass("Failure")("Failure", {
  error: Schema.String,
}) {}

const Result = Schema.Union([Success, Failure])
type Result = typeof Result.Type

// Exhaustive pattern matching
const renderResult = (result: Result) =>
  Match.valueTags(result, {
    Success: ({ value }) => `Got: ${value}`,
    Failure: ({ error }) => `Error: ${error}`,
  })
```

## Branded Types

Brand nearly all primitives with semantic meaning. Not just IDs, but emails, URLs, counts, ports, slugs:

```typescript
import { Schema } from "effect"

// Entity IDs
const UserId = Schema.String.pipe(Schema.brand("UserId"))
type UserId = typeof UserId.Type

const PostId = Schema.String.pipe(Schema.brand("PostId"))
type PostId = typeof PostId.Type

// Domain primitives
const Email = Schema.String.pipe(Schema.brand("Email"))
type Email = typeof Email.Type

const Port = Schema.Int.pipe(
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 65535 })),
  Schema.brand("Port")
)
type Port = typeof Port.Type

// Usage: impossible to mix types
const userId = UserId.makeUnsafe("user-123")
const postId = PostId.makeUnsafe("post-456")

function getUser(id: UserId) { /* ... */ }
// getUser(postId) // Type error: can't pass PostId where UserId expected
```

## JSON Encoding and Decoding

Use `Schema.fromJsonString` to combine JSON.parse + schema decoding in one step:

```typescript
import { Effect, Schema } from "effect"

class Move extends Schema.Class("Move")({
  from: Schema.String,
  to: Schema.String,
}) {}

const MoveFromJson = Schema.fromJsonString(Move)

const program = Effect.gen(function* () {
  // Decode from JSON string
  const jsonString = '{"from":"A1","to":"B2"}'
  const move = yield* Schema.decodeUnknownEffect(MoveFromJson)(jsonString)

  // Encode back to JSON string
  const json = yield* Schema.encodeEffect(MoveFromJson)(move)
  return json
})
```

Use the `FromJson` schema (not the base schema) for both decode and encode when working with JSON strings.

## Common Schema Primitives

| Schema | TypeScript Type | Notes |
|--------|----------------|-------|
| `Schema.String` | `string` | |
| `Schema.Number` | `number` | |
| `Schema.Int` | `number` | Integer validation |
| `Schema.Boolean` | `boolean` | |
| `Schema.Date` | `Date` | Parses from ISO string |
| `Schema.DateTimeUtc` | `DateTime.Utc` | Effect DateTime |
| `Schema.UUID` | `string` | UUID format validation |
| `Schema.NonEmptyString` | `string` | Min length 1 |
| `Schema.NullOr(S)` | `T \| null` | Nullable |
| `Schema.Array(S)` | `readonly T[]` | Array of schema |
| `Schema.Struct({...})` | `{...}` | Object shape |
| `Schema.Redacted(S)` | `Redacted<T>` | Hidden in logs |
| `Schema.Defect` | `unknown` | Wraps unknown errors |

### Validation Combinators

```typescript
// String constraints
Schema.String.pipe(Schema.minLength(1), Schema.maxLength(255))

// Number constraints
Schema.Number.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
)

// Pattern matching
Schema.String.pipe(Schema.pattern(/^[a-z]+$/))

// Optional fields
Schema.Struct({
  name: Schema.String,
  bio: Schema.optional(Schema.String),
})
```
