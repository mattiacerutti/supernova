# Option vs Null Patterns

## The Rule

Use `Option<T>` for Effect domain logic. Use `T | null` only at external boundaries.

## When to Use Option<T>

- Internal Effect computations
- Domain models where absence has meaning
- Function returns that may not produce a value
- Chain operations that may fail to produce a value

## When to Use T | null

- React state/props (hooks expect nullable primitives)
- JSON serialization (Option doesn't serialize to JSON)
- External API responses
- Database query results
- localStorage/sessionStorage values

## Boundary Normalization

```typescript
import { Option } from "effect"

// Incoming: null → Option (at API/storage boundary)
const fromApi = Option.fromNullable(response.data)
const fromStorage = Option.fromNullable(localStorage.getItem("key"))

// Outgoing: Option → null (for React/JSON)
const toReact = Option.getOrNull(maybeValue)
const toJson = Option.getOrUndefined(maybeValue)
```

## Common Patterns

```typescript
// Map over optional value
Option.map(maybeUser, (user) => user.name)

// Chain optional operations
Option.flatMap(maybeUser, (user) => Option.fromNullable(user.profile))

// Provide default
Option.getOrElse(maybeValue, () => defaultValue)

// Check and extract
if (Option.isSome(maybeValue)) {
  console.log(maybeValue.value)  // Safe access
}
```

## Avoid Option\<Option<T>> Creep

```typescript
// WRONG: Nested options from repeated normalization
const bad = Option.fromNullable(Option.fromNullable(x))

// RIGHT: Normalize once at the boundary
const good = Option.fromNullable(x)

// If you have nested options, flatten them
const flattened = Option.flatten(nestedOption)
```

## Schema Decoding

```typescript
import { Schema } from "effect"

// Optional field with Option type
const UserSchema = Schema.Struct({
  name: Schema.String,
  nickname: Schema.optionalWith(Schema.String, { as: "Option" })
})
// nickname will be Option<string>

// Optional field with null (for JSON compat)
const ApiUserSchema = Schema.Struct({
  name: Schema.String,
  nickname: Schema.NullOr(Schema.String)
})
// nickname will be string | null
```

## Effect-Atom Integration

```typescript
// Atoms with nullable state (for React compat)
const userAtom = Atom.make<User | null>(null)

// Convert at boundaries
const program = Effect.gen(function* () {
  const maybeUser = yield* fetchUser()  // Returns Option<User>
  return Option.getOrNull(maybeUser)    // Convert for React
})
```
