# Stream Patterns

Streams are lazy, pull-based sequences of values that can be infinite. Handle with care.

## Create Streams

```typescript
import { Stream } from "effect"

// From values
Stream.make(1, 2, 3)

// From iterable
Stream.fromIterable([1, 2, 3])

// Single value from effect
Stream.fromEffect(fetchUser())

// Infinite stream from repeated effect
Stream.repeatEffect(Effect.sync(() => Math.random()))

// From async iterable
Stream.fromAsyncIterable(asyncGenerator(), (error) => new StreamError({ cause: error }))

// Chunks for efficiency
Stream.fromChunk(Chunk.make(1, 2, 3))
```

## Consume Streams

```typescript
// Collect all values (DANGEROUS for infinite streams)
const allValues = yield* Stream.runCollect(stream)  // Returns Chunk<A>

// Process each element
yield* Stream.runForEach(stream, (value) => Effect.log(`Got: ${value}`))

// Fold/reduce
const sum = yield* Stream.runFold(stream, 0, (acc, n) => acc + n)

// First element only
const first = yield* Stream.runHead(stream)  // Returns Option<A>

// Drain (run for side effects, discard values)
yield* Stream.runDrain(stream)
```

## Bound Consumption (Critical for Safety)

```typescript
// WRONG: Hangs forever on infinite stream
yield* Stream.runCollect(infiniteStream)

// RIGHT: Take first N elements
yield* Stream.runCollect(Stream.take(infiniteStream, 100))

// RIGHT: Take until condition
yield* Stream.runCollect(Stream.takeUntil(stream, (x) => x > 100))

// RIGHT: Take while condition holds
yield* Stream.runCollect(Stream.takeWhile(stream, (x) => x < 100))

// RIGHT: Apply timeout
yield* Stream.runCollect(stream).pipe(Effect.timeout("5 seconds"))
```

## Transform Streams

```typescript
// Map values
Stream.map(stream, (x) => x * 2)

// Filter values
Stream.filter(stream, (x) => x > 0)

// FlatMap (each value produces a stream)
Stream.flatMap(userIds, (id) => Stream.fromEffect(fetchUser(id)))

// Tap for side effects
Stream.tap(stream, (x) => Effect.log(`Processing: ${x}`))

// Scan (running fold)
Stream.scan(stream, 0, (acc, x) => acc + x)  // Emits running totals
```

## Chunk and Batch

```typescript
// Group into chunks of N
Stream.grouped(stream, 100)  // Stream<Chunk<A>>

// Group by time window
Stream.groupedWithin(stream, 100, "1 second")

// Rechunk for efficiency
Stream.rechunk(stream, 1000)
```

## Handle Errors in Streams

```typescript
// Catch errors and recover
Stream.catchAll(stream, (error) => Stream.make(fallbackValue))

// Retry on failure
Stream.retry(stream, Schedule.exponential("100 millis"))

// Handle specific error tags
Stream.catchTag(stream, "NetworkError", (e) => Stream.empty)
```

## Resource Safety

```typescript
// Bracket pattern for streams
Stream.acquireRelease(
  acquire,   // Effect<Resource, E, R>
  release    // (resource: Resource) => Effect<void>
)

// Scoped stream (resource released when stream completes)
Stream.scoped(Effect.acquireRelease(open, close))

// Finalizer
Stream.ensuring(stream, cleanup)
```

## Common Gotchas

1. **Infinite streams**: Always bound consumption with `take`, `takeUntil`, or timeout
2. **Backpressure**: Streams are pull-based; slow consumers automatically apply backpressure
3. **Resource leaks**: Use scoped/bracket patterns for resources
4. **Chunking overhead**: Rechunk for better performance with small items
5. **Error propagation**: Errors terminate the stream; use `catchAll` to recover
