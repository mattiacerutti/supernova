# Pattern Matching (Match Module)

> When to read: pull this in when you need Effect's Match module to handle tagged unions, replace nested catchTag chains, or pattern-match on values exhaustively.

**Default branching tool for tagged unions and complex conditionals.**

```typescript
import { Match } from "effect"

// Type-safe exhaustive matching on tagged errors
const handleError = Match.type<AppError>().pipe(
  Match.tag("UserCancelledError", () => null),          // Expected rejection
  Match.tag("ValidationError", (e) => e.message),       // Domain error
  Match.tag("NetworkError", () => "Connection failed"), // Retryable
  Match.exhaustive  // Compile error if case missing
)

// Replace nested catchTag chains
// BEFORE: effect.pipe(catchTag("A", ...), catchTag("B", ...), catchTag("C", ...))
// AFTER:
Effect.catchAll(effect, (error) =>
  Match.value(error).pipe(
    Match.tag("A", handleA),
    Match.tag("B", handleB),
    Match.tag("C", handleC),
    Match.exhaustive
  )
)

// Match on values (cleaner than if/else)
const describe = Match.value(status).pipe(
  Match.when("pending", () => "Loading..."),
  Match.when("success", () => "Done!"),
  Match.orElse(() => "Unknown")
)
```
