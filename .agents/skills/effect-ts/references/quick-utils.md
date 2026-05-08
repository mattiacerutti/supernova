# Quick Utilities (Array, Functions, Deprecations)

> When to read: pull this in when sorting arrays with `Order`, using small utility helpers like `constVoid`, or checking the running list of Effect deprecations.

## Array Operations

```typescript
import { Array as Arr, Order } from "effect"

// Sorting with built-in orderings (accepts any Iterable)
Arr.sort([3, 1, 2], Order.number)              // [1, 2, 3]
Arr.sort(["b", "a", "c"], Order.string)        // ["a", "b", "c"]
Arr.sort(new Set([3n, 1n, 2n]), Order.bigint)  // [1n, 2n, 3n]

// Sort by derived value
Arr.sortWith(users, (u) => u.age, Order.number)

// Sort by multiple criteria
Arr.sortBy(
  users,
  Order.mapInput(Order.number, (u: User) => u.age),
  Order.mapInput(Order.string, (u: User) => u.name)
)

// Built-in orderings: Order.string, Order.number, Order.bigint, Order.boolean, Order.Date
// Reverse ordering: Order.reverse(Order.number)
```

## Utility Functions

```typescript
import { constVoid as noop } from "effect/Function"

// constVoid returns undefined, useful as a no-operation callback
noop()  // undefined

// Common use cases:
Effect.tap(effect, noop)              // Ignore value, just run effect
Promise.catch(noop)                   // Swallow errors
eventEmitter.on("event", noop)        // Register empty handler
```

## Deprecations

- **`BigDecimal.fromNumber`** — Use `BigDecimal.unsafeFromNumber` instead (3.11.0+)
- **`Schema.annotations()`** — Now removes previously set identifier annotations; identifiers are tied to the schema's
  `ast` reference only (3.17.10)
