# Effect + Next.js Integration

`@prb/effect-next` provides typed helpers for integrating Effect with Next.js 15+ App Router—route handlers, server
actions, middleware, and React hooks.

## Core API

### Route Handlers

```typescript
// app/api/users/[id]/route.ts
import { effectHandler } from "@prb/effect-next/handlers";
import { Effect } from "effect";
import { RouteParams } from "@prb/effect-next/params";

export const GET = effectHandler(
  Effect.gen(function* () {
    const params = yield* RouteParams;
    const user = yield* fetchUser(params.id);
    return Response.json(user);
  }),
  AppLayer
);
```

### Server Actions

```typescript
"use server";
import { effectAction } from "@prb/effect-next/action";
import { Effect } from "effect";

export const createUser = effectAction(
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.insert(users).values({ name: "Alice" });
  }),
  AppLayer
);

// Returns Exit-like result with _tag: "Success" | "Failure"
const result = await createUser();
if (result._tag === "Success") {
  console.log(result.value);
}
```

### Middleware

```typescript
// middleware.ts
import { effectMiddleware } from "@prb/effect-next/middleware";
import { Effect, Layer } from "effect";
import { Headers } from "@prb/effect-next/headers";

const AuthLayer = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const headers = yield* Headers;
    const token = headers.get("authorization");
    if (!token) yield* Effect.fail({ _tag: "Unauthorized" });
    return { validateToken: () => Effect.succeed(true) };
  })
);

export const middleware = effectMiddleware(
  Effect.gen(function* () {
    yield* AuthService;
    return NextResponse.next();
  }),
  AuthLayer
);
```

## React Hooks

Client-side hooks for running Effects in React components.

```typescript
"use client";
import {
  EffectNextProvider,
  useEffectNextRuntime,
  useEffectMemo,
  useEffectOnce,
  useForkEffect,
  useStream,
  useStreamLatest,
  useSubscriptionRef
} from "@prb/effect-next/react-hooks";

// Wrap app with provider
<EffectNextProvider runtime={runtime}>{children}</EffectNextProvider>;

// Access runtime
const runtime = useEffectNextRuntime();

// Run Effect with dependencies (like useMemo)
const data = useEffectMemo(() => effect, [deps], runtime);

// Run Effect once on mount
const data = useEffectOnce(effect, runtime);

// Run Effect in background (fire-and-forget)
useForkEffect(effect, runtime, [deps]);

// Subscribe to Stream
const values = useStream(stream, runtime);
const latest = useStreamLatest(stream, runtime, initialValue);

// Subscribe to SubscriptionRef
const value = useSubscriptionRef(ref, runtime);
```

## Request-Scoped Cache

Leverage React's `cache()` for request deduplication.

```typescript
import { reactCache, reactCacheFn, reactCacheWithKey } from "@prb/effect-next/cache";
import { ManagedRuntime } from "effect";

const runtime = ManagedRuntime.make(AppLayer);

// Cache an Effect
export const getUsers = reactCache(
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.query("SELECT * FROM users");
  }),
  runtime
);

// Cache a function with arguments
export const getUserById = reactCacheFn((id: string) =>
  Effect.gen(function* () {
    const db = yield* Database;
    return yield* db.query(`SELECT * FROM users WHERE id = ${id}`);
  }),
  runtime
);

// Cache with custom key
export const getUser = reactCacheWithKey(
  (opts) => fetchUserEffect(opts),
  (opts) => `user:${opts.id}`,
  runtime
);
```

## Headers & Cookies

```typescript
import { Headers, Cookies } from "@prb/effect-next/headers";

Effect.gen(function* () {
  const headers = yield* Headers;
  const userAgent = headers.get("user-agent");

  const cookies = yield* Cookies;
  const sessionId = cookies.get("sessionId");
});
```

## Params

```typescript
import { RouteParams, SearchParams } from "@prb/effect-next/params";

Effect.gen(function* () {
  const params = yield* RouteParams;
  const userId = params.id;

  const searchParams = yield* SearchParams;
  const page = searchParams.page;
});
```

## Navigation

```typescript
import { redirect, rewrite, notFound } from "@prb/effect-next/navigation";

Effect.gen(function* () {
  yield* redirect("/login");
  yield* rewrite("/new-path");
  yield* notFound();
});
```

## Testing Kit

```typescript
import {
  assertRight,
  assertLeft,
  expectTaggedFailure,
  expectDefect,
  runExpectSuccess,
  runExpectFailure,
  makeMockRuntime
} from "@prb/effect-next/testing-kit";

// Assert success
test("should succeed", async () => {
  const exit = await Effect.runPromiseExit(effect);
  const value = assertRight(exit);
  expect(value).toBe(42);
});

// Assert specific failure tag
test("should fail with NotFound", async () => {
  const exit = await Effect.runPromiseExit(effect);
  expectTaggedFailure(exit, "NotFound");
});

// Run and expect success
test("should create user", async () => {
  const user = await runExpectSuccess(createUser(), runtime);
  expect(user.name).toBe("Alice");
});
```

## Best Practices

1. **Use `Effect.fn()`** — Automatic telemetry spans and better stack traces
2. **Centralize layers** — Create `AppLayer` with all shared services
3. **Error handling** — Use `.catchAll()` or `.catchTag()` for Effect-level errors
4. **Request caching** — Use `reactCache` for request-scoped memoization
5. **Server-only Effect** — Effect-ts shines server-side; avoid complex Effect in client components
