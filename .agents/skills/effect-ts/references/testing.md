# Testing Effect-TS (Vitest) — Reference

This is a pragmatic guide for writing _deterministic_ tests in Effect-TS codebases, especially when using `@effect/vitest`.

## The #1 gotcha: `it.effect` uses `TestClock`

`@effect/vitest`'s `it.effect` runs your test with a **TestContext** (including **`TestClock`**).

Implications:

- Time starts at **0**.
- Time does **not** pass unless you advance it.
- Any `Effect.sleep(...)`, `Schedule.spaced(...)`, retry backoff, polling loop, etc. will **stall forever** unless you call `TestClock.adjust(...)`.

Use `it.live` when you truly want wall-clock time.

## Time: don't use `Date.now()` in Effect code

If production code uses `Date.now()`, it becomes hard (or impossible) to test deterministically under `TestClock`.

Prefer Effect's clock service:

```ts
import { Clock, Effect } from "effect";

const nowMillis = Clock.currentTimeMillis;

const program = Effect.gen(function* () {
  const now = yield* Clock.currentTimeMillis;
  return now;
});
```

That makes your code controllable via `TestClock`.

## Replace `Effect.sleep` with `TestClock.adjust` (under `it.effect`)

Instead of:

```ts
yield * Effect.sleep("50 millis");
```

do:

```ts
import { TestClock } from "effect";

yield * TestClock.adjust("50 millis");
```

If you _must_ use real timers (e.g. testing integration with Node timers), switch the whole test to `it.live`.

## Testing retries / backoff / scheduled loops

Retry schedules and `Schedule.spaced(...)` don't progress under `TestClock` unless you advance time.

A reliable pattern is:

```ts
import { Effect, Fiber, TestClock } from "effect";

const runWithTime = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  adjust: Parameters<typeof TestClock.adjust>[0] = "1000 millis"
) =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(effect);
    yield* TestClock.adjust(adjust);
    return yield* Fiber.join(fiber);
  });
```

Advance _enough_ time for the whole schedule/backoff chain to complete.

## Streams, watches, and background fibers: always bound + cleanup

Most test “hangs” in Effect come from one of these:

- A stream that never ends (`Stream.runCollect(stream)` on an infinite stream)
- A watch/polling loop forked and never interrupted
- A scoped resource that never gets finalized because the scope never closes

Recommendations:

- Prefer bounded consumption: `Stream.take(stream, n)` / `Stream.takeUntil(...)`.
- If you fork a fiber, ensure it is interrupted on all paths:
  - `yield* Fiber.interrupt(fiber)`
  - or run it inside a `Scope` and let scope finalizers do the cleanup.
- Consider `Effect.timeout(...)` / `Effect.timeoutFail(...)` around anything that could block.

## Concurrency gotcha: `Effect.fork` does **not** mean “the fiber has started”

When you write a test like:

- fork 2–3 fibers
- then immediately `Deferred.succeed(gate, ...)`

…you have **not** guaranteed that the forked fibers have reached the code you intend to coordinate (e.g. `Deferred.await(gate)`).

`Effect.fork` creates a fiber and schedules it, but the scheduler may not run it until later. If you open the gate too early:

- each fiber can observe the gate as already-open
- your “concurrent” test can become **effectively sequential**
- assertions like “underlying effect executed once” can fail intermittently even though the implementation is correct

### Deterministic pattern: `started` latch + `gate`

If you need to ensure real overlap, add a second `Deferred` that the underlying effect completes as soon as it begins:

```ts
import { Deferred, Effect, Fiber } from "effect";

Effect.gen(function* () {
  let executions = 0;

  const started = yield* Deferred.make<void>();
  const gate = yield* Deferred.make<void>();

  const underlying = Effect.gen(function* () {
    executions++;
    // Signal we actually started executing (at least one fiber is “in” now)
    yield* Deferred.succeed(started, undefined);
    // Block here to force overlap
    yield* Deferred.await(gate);
    return "ok";
  });

  const f1 = yield* Effect.fork(underlying);
  const f2 = yield* Effect.fork(underlying);

  // Don't open the gate until at least one fiber definitely started
  yield* Deferred.await(started);
  yield* Deferred.succeed(gate, undefined);

  yield* Fiber.join(f1);
  yield* Fiber.join(f2);

  // Now it's safe to assert expectations about overlap / dedup / sharing
  // expect(executions).toBe(1)
});
```

This avoids “we opened the gate before any fiber ran” flakiness and makes concurrency assertions reliable.

## Use `it.scoped` when your test allocates scoped resources

If your test (or the code under test) uses `Effect.acquireRelease`, `Stream.asyncScoped`, resourceful Layers, etc.,
prefer `it.scoped` / `it.scopedLive` so finalizers are guaranteed to run when the test completes.

## Don't “escape” the test runtime inside an Effect test

Avoid calling `Effect.runPromise(...)` (or similar “run” APIs) _inside_ an `it.effect` program to drive internal logic.
It can accidentally run work on a different runtime (e.g. a live clock), defeating `TestClock` determinism.

Prefer staying inside the Effect you're already running:

- pass `Effect`s around and `yield*` them
- if you truly need a Promise boundary, do it at the test boundary, not mid-program

## Quick decision table

- Uses timeouts/sleeps/retries/polling? → `it.effect` + `TestClock.adjust(...)`
- Needs wall clock / Node timers / real delays? → `it.live` (or `it.scopedLive`)
- Allocates resources that must be finalized? → `it.scoped` / `it.scopedLive`
