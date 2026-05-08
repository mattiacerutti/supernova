# Runtime Patterns

> When to read: pull this in when working with resource lifecycles, durations, scheduling/retry/repeat, mutable state (Ref / Deferred), reactive references (SubscriptionRef), or concurrency primitives (fork, race, Fiber).

## Resource Management

```typescript
Effect.acquireUseRelease(acquire, use, release)  // Bracket pattern
Effect.scoped(effect)                            // Scope lifetime to effect
Effect.addFinalizer(cleanup)                     // Register cleanup action
```

## Duration

Effect accepts human-readable duration strings anywhere a `DurationInput` is expected:

```typescript
// String syntax (preferred) - singular or plural forms work
Duration.toMillis("5 minutes")    // 300000
Duration.toMillis("1 minute")     // 60000
Duration.toMillis("30 seconds")   // 30000
Duration.toMillis("100 millis")   // 100

// Verbose syntax (avoid)
Duration.toMillis(Duration.minutes(5))  // Same result, more verbose

// Common units: millis, seconds, minutes, hours, days, weeks
// Also: nanos, micros
```

## Scheduling

```typescript
Effect.retry(effect, Schedule.exponential("100 millis"))  // Retry with backoff
Effect.repeat(effect, Schedule.fixed("1 second"))         // Repeat on schedule
Schedule.compose(s1, s2)                                  // Combine schedules
```

## State Management

```typescript
Ref.make(initialValue)       // Mutable reference
Ref.get(ref)                 // Read value
Ref.set(ref, value)          // Write value
Deferred.make<E, A>()        // One-time async value
```

## SubscriptionRef (Reactive References)

```typescript
// WARNING: Never use unsafeMake - it may not exist in your Effect version.
// If you see "unsafeMake is not a function", use the safe API below.

SubscriptionRef.make(initial)      // Create reactive reference (safe)
SubscriptionRef.get(ref)           // Read current value
SubscriptionRef.set(ref, value)    // Update value (notifies subscribers)
SubscriptionRef.changes(ref)       // Stream of value changes

// React integration (effect-atom pattern)
const ref = yield* SubscriptionRef.make<User | null>(null)
// Hook reads: useSubscriptionRef(ref) — returns current value or null
// Handle null explicitly in components
```

## Concurrency

```typescript
Effect.fork(effect)              // Run in background fiber
Fiber.join(fiber)                // Wait for fiber result
Effect.race(effect1, effect2)    // First to complete wins
Effect.all([...effects], { concurrency: "unbounded" })
```
