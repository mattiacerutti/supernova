# Effect-Atom Reference

Reactive state management library for Effect. Provides atoms (reactive state containers) that integrate with Effect's
functional programming ecosystem and React.

**Source code:** https://github.com/tim-smart/effect-atom (open in browser)

## Core API

### Creating Atoms

```typescript
import { Atom } from "@effect-atom/atom-react"

// Simple value atom
const countAtom = Atom.make(0)

// Derived atom (computed from other atoms)
const doubleAtom = Atom.make((get) => get(countAtom) * 2)

// Effectful atom (returns Result type)
const userAtom = Atom.make(
  Effect.gen(function* () {
    const api = yield* Api
    return yield* api.fetchUser()
  })
)

// Keep value when component unmounts (prevents reset)
const persistentAtom = Atom.make(0).pipe(Atom.keepAlive)
```

### React Hooks

```typescript
import { useAtomValue, useAtomSet, useAtom } from "@effect-atom/atom-react"

function Counter() {
  // Read-only access
  const count = useAtomValue(countAtom)

  // Write-only access
  const setCount = useAtomSet(countAtom)

  // Read and write access
  const [value, setValue] = useAtom(countAtom)

  return <button onClick={() => setCount((n) => n + 1)}>{count}</button>
}
```

### Atom Families

Generate stable atom references for dynamic keys:

```typescript
const userAtomFamily = Atom.family((userId: string) =>
  Atom.make(
    Effect.gen(function* () {
      const api = yield* Api
      return yield* api.fetchUser(userId)
    })
  )
)

// Usage
const userAtom = userAtomFamily("user-123")
```

### Atom Functions

Create callable effects:

```typescript
const incrementFn = Atom.fn(
  Effect.gen(function* () {
    const count = yield* Ref.get(counterRef)
    yield* Ref.set(counterRef, count + 1)
  })
)

// Invoke with useAtomSet
const increment = useAtomSet(incrementFn)
increment() // Returns Promise<Exit<...>>
```

### Atom Runtime

Create atom runtime from Effect layers for dependency injection:

```typescript
const runtimeAtom = Atom.runtime(ApiLive)

function App() {
  return (
    <AtomProvider runtime={runtimeAtom}>
      <MyComponent />
    </AtomProvider>
  )
}
```

## Advanced Features

### URL Search Parameters

Bind atoms to URL search parameters:

```typescript
const pageAtom = Atom.searchParam("page", {
  decode: (s) => parseInt(s ?? "1", 10),
  encode: (n) => n.toString(),
})
```

### Local Storage Persistence

```typescript
const settingsAtom = Atom.kvs({
  key: "app-settings",
  defaultValue: { theme: "dark" },
})
```

### Scoped Resources

Add finalizers for cleanup when atom rebuilds or unmounts:

```typescript
const websocketAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const ws = yield* WebSocket.connect("wss://...")
    yield* Effect.addFinalizer(() => ws.close())
    return ws
  })
)
```

### Event Listeners with Self-Update

```typescript
const windowSizeAtom = Atom.make((get) =>
  Effect.gen(function* () {
    const handler = () =>
      get.setSelf({ width: window.innerWidth, height: window.innerHeight })

    window.addEventListener("resize", handler)
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => window.removeEventListener("resize", handler))
    )

    return { width: window.innerWidth, height: window.innerHeight }
  })
)
```

### Reactivity Keys

Trigger cache invalidation:

```typescript
const dataAtom = Atom.make(
  Effect.gen(function* () {
    const keys = yield* Atom.withReactivity(["data-key"])
    // Re-runs when "data-key" is invalidated
    return yield* fetchData()
  })
)
```

### RPC and HTTP API Integration

```typescript
// RPC client
const rpcClient = AtomRpc.Tag()

// HTTP API client
const httpClient = AtomHttpApi.Tag()
```

## Result Handling

Effectful atoms return `Result` types. Handle with pattern matching:

```typescript
function UserProfile() {
  const userResult = useAtomValue(userAtom)

  return Result.match(userResult, {
    onSuccess: (user) => <div>{user.name}</div>,
    onFailure: (error) => <div>Error: {error.message}</div>,
  })
}
```

### Mutation Results

Use `mode: "promiseExit"` for mutation handling:

```typescript
const saveUser = useAtomSet(saveUserAtom, { mode: "promiseExit" })

const handleSave = async () => {
  const exit = await saveUser(userData)
  if (Exit.isSuccess(exit)) {
    // Handle success
  }
}
```

## Streams

Pull values from streams:

```typescript
const messagesAtom = Atom.pull(messageStream)
```

## Best Practices

1. **Use `Atom.family` for dynamic keys** — Generates stable references, avoids memory leaks
2. **Apply `Atom.keepAlive` for persistent state** — Prevents reset on unmount
3. **Use `Atom.runtime` for dependency injection** — Integrates Effect layers with React context
4. **Implement finalizers for cleanup** — Ensures proper resource management
5. **Use `mode: "promiseExit"` for mutations** — Provides typed success/failure handling
6. **Prefer derived atoms over component state** — Keeps state logic centralized
