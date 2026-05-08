# Services and Layers

> When to read: pull this in when defining or composing Effect services, choosing between `Context.Tag` / `Effect.Service` / `Context.Reference` / `Context.ReadonlyTag`, or writing generator-based effects with `Effect.gen` and `Effect.fn`.

## Services and Layers

```typescript
// Pattern 1: Context.Tag (implementation provided separately via Layer)
class MyService extends Context.Tag("MyService")<MyService, { ... }>() {}
const MyServiceLive = Layer.succeed(MyService, { ... })
Effect.provide(effect, MyServiceLive)

// Pattern 2: Effect.Service (default implementation bundled)
class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
  effect: Effect.gen(function* () {
    const db = yield* Database
    return { findAll: db.query("SELECT * FROM users") }
  }),
  dependencies: [Database.Default],  // Optional service dependencies
  accessors: true                     // Auto-generate method accessors
}) {}
Effect.provide(effect, UserRepo.Default)  // .Default layer auto-generated
// Use UserRepo.DefaultWithoutDependencies when deps provided separately

// Effect.Service with parameters (3.16.0+)
class ConfiguredApi extends Effect.Service<ConfiguredApi>()("ConfiguredApi", {
  effect: (config: { baseUrl: string }) =>
    Effect.succeed({ fetch: (path: string) => `${config.baseUrl}/${path}` })
}) {}

// Pattern 3: Context.Reference (defaultable tags - 3.11.0+)
class SpecialNumber extends Context.Reference<SpecialNumber>()(
  "SpecialNumber",
  { defaultValue: () => 2048 }
) {}
// No Layer required if default value suffices

// Pattern 4: Context.ReadonlyTag (covariant - 3.18.0+)
// Use for functions that consume services without modifying the type
function effectHandler<I, A, E, R>(service: Context.ReadonlyTag<I, Effect.Effect<A, E, R>>) {
  // Handler can use service in a covariant position
}
```

## Generator Pattern

```typescript
Effect.gen(function* () {
  const a = yield* effectA;
  const b = yield* effectB;
  if (error) {
    return yield* Effect.fail(new MyError());
  }
  return result;
});

// Effect.fn - automatic tracing and telemetry (preferred for named functions)
const fetchUser = Effect.fn("fetchUser")(function* (id: string) {
  const db = yield* Database
  return yield* db.query(id)
})
// Creates spans, captures call sites, provides better stack traces
```
