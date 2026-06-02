# Process and Scope Management

Adapted from [artimath/effect-skills](https://github.com/artimath/effect-skills) (MIT), updated for Effect v4.

## Table of Contents

- [Fork Types](#fork-types)
- [Scope Patterns](#scope-patterns)
- [Command (Child Processes)](#command-child-processes)
- [Scope.extend](#scopeextend)
- [Killable Background Process Example](#killable-background-process-example)

## Fork Types

| Type | Lifetime | Cleanup | Use Case |
|------|----------|---------|----------|
| `Effect.fork` | Dies with parent fiber | Automatic | Concurrent work within a scope |
| `Effect.forkScoped` | Dies with scope | Auto-registered | Server workers, scoped tasks |
| `Effect.forkDaemon` | Independent | **Manual required** | Background tasks outliving parent |
| `Effect.forkChild` | Dies with parent | Automatic | Child tasks for TestClock |

```typescript
import { Effect, Fiber, Scope } from "effect"

// fork: dies with parent
const fiber = yield* Effect.fork(myEffect)
const result = yield* Fiber.join(fiber)

// forkScoped: dies when scope closes
yield* Effect.forkScoped(backgroundLoop)

// forkDaemon: outlives parent, YOU must clean up
const fiber = yield* Effect.forkDaemon(work)
yield* scope.addFinalizer(() => Fiber.interrupt(fiber))
```

## Scope Patterns

### Automatic (Short-Lived)

`Effect.scoped` creates and closes the scope around the effect:

```typescript
const output = yield* Effect.scoped(
  Effect.gen(function* () {
    const process = yield* startProcess(cmd)
    return yield* collectOutput(process.stdout)
  })
)
// Process auto-killed when scope exits
```

### Manual (Long-Lived, Killable)

Use `Scope.make()` for external lifetime control:

```typescript
import { Effect, Scope, Exit } from "effect"

// Create a scope WE control
const scope = yield* Scope.make()

// Start resource in OUR scope
const process = yield* startProcess(cmd).pipe(Scope.extend(scope))

// Later, to tear down:
yield* Scope.close(scope, Exit.void)
```

### acquireRelease

For resources needing setup and cleanup:

```typescript
const connection = yield* Effect.acquireRelease(
  openConnection(),                                    // acquire
  (conn) => closeConnection(conn).pipe(Effect.orDie)   // release
)
```

## Command (Child Processes)

Use `@effect/platform` Command service instead of raw `child_process`:

```typescript
import { Command } from "@effect/platform"
import { Effect, Stream, Chunk } from "effect"

const runCommand = Effect.gen(function* () {
  const cmd = Command.make("git", "status")
  const proc = yield* Command.start(cmd)

  // Read stdout as text
  const outputChunks = yield* proc.stdout.pipe(
    Stream.decodeText(),
    Stream.runCollect,
  )
  const output = Chunk.toReadonlyArray(outputChunks).join("")

  // Wait for exit
  const exitCode = yield* proc.exitCode

  return { exitCode, output }
}).pipe(Effect.scoped) // auto-cleanup
```

### Writing to stdin

```typescript
const runWithInput = (command: string, input: string) =>
  Effect.gen(function* () {
    const cmd = Command.make("bash", "-c", command)
    const proc = yield* Command.start(cmd)

    // Write to stdin
    yield* Stream.make(new TextEncoder().encode(input)).pipe(
      Stream.run(proc.stdin)
    )

    const output = yield* proc.stdout.pipe(
      Stream.decodeText(),
      Stream.runCollect,
    )

    return {
      exitCode: yield* proc.exitCode,
      output: Chunk.toReadonlyArray(output).join(""),
    }
  }).pipe(Effect.scoped)
```

### Process interface

```typescript
interface Process {
  readonly pid: ProcessId
  readonly exitCode: Effect<ExitCode>       // waits for completion
  readonly isRunning: Effect<boolean>
  readonly kill: (signal?: Signal) => Effect<void>
  readonly stdout: Stream<Uint8Array>
  readonly stderr: Stream<Uint8Array>
  readonly stdin: Sink<void, Uint8Array>
}
```

**Why Command over child_process.spawn:**
- Scoped cleanup (process killed on scope close)
- Stream-based stdin/stdout
- Effect error handling
- No manual timeout/cleanup logic

## Scope.extend

Ties a resource's lifetime to a specific scope and removes `Scope` from the effect's requirements:

```typescript
// Before: Effect<Process, E, CommandExecutor | Scope>
const scoped = Command.start(cmd)

// After: Effect<Process, E, CommandExecutor>  (Scope satisfied)
const extended = scoped.pipe(Scope.extend(myScope))
```

## Killable Background Process Example

```typescript
import { Effect, Scope, Exit, Ref, HashMap, Stream, Chunk } from "effect"
import { Command } from "@effect/platform"

interface BackgroundShell {
  readonly id: string
  readonly process: Process
  readonly scope: Scope.CloseableScope
  readonly output: string
  readonly isComplete: boolean
  readonly exitCode?: number
}

const startBackground = (command: string) =>
  Effect.gen(function* () {
    const id = `shell-${crypto.randomUUID()}`
    const scope = yield* Scope.make()

    const cmd = Command.make("bash", "-c", command)
    const process = yield* Command.start(cmd).pipe(Scope.extend(scope))

    // Fork ONLY the output collection (not the scoped acquisition)
    yield* Effect.forkDaemon(
      Effect.gen(function* () {
        const stdout = yield* process.stdout.pipe(
          Stream.decodeText(), Stream.runCollect,
        )
        const exitCode = yield* process.exitCode
        // store results...
      }).pipe(Effect.ignore)
    )

    return { id, process, scope }
  })

const killShell = (shell: BackgroundShell) =>
  Effect.gen(function* () {
    if (!shell.isComplete) {
      yield* shell.process.kill("SIGTERM")
    }
    yield* Scope.close(shell.scope, Exit.void)
  })
```

## Common Anti-Pattern

```typescript
// BAD: process trapped inside daemon's scope, unreachable from outside
yield* Effect.forkDaemon(
  Effect.scoped(
    Effect.gen(function* () {
      const process = yield* Command.start(cmd) // can't access this!
    })
  )
)

// GOOD: manual scope, fork only the work
const scope = yield* Scope.make()
const process = yield* Command.start(cmd).pipe(Scope.extend(scope))
yield* Effect.forkDaemon(collectOutput(process)) // fork only collection
```
