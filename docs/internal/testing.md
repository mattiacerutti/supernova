# Testing

Commands are in [Development](development.md#verification).

## Layers

Put a test in the outermost layer that can observe the behavior.

- **Behavior E2E** (`packages/web/tests/e2e`): the built server and client in a browser. Anything a user does or sees: what is sent, what the model receives, what is on disk, what survives a reload.
- **Integration** (`packages/agent-runtime/tests/integration`): features over the real engine and disk. Races, injected failures, recovery, migrations, and the wire contract: behavior the UI cannot drive deterministically.
- **Unit** (`tests/unit`): pure functions only, such as paging, limits, and model defaults.
- **Timeline visual** (`packages/web/tests/timeline`): scrolling, pinning, and motion, measured per frame. It is timing-sensitive, so it is not in CI; run it only when you change timeline rendering, animation, or interaction. A test of an outcome rather than a frame belongs in the behavior suite.

A user-facing feature needs a behavior test for its main flow and for each failure the user can see. A race that the behavior suite only shows under load gets a deterministic integration test that holds the step open.

## Fakes and data

- The model is the only fake: Pi's faux provider in integration tests, the scripted HTTP model in the behavior suite.
- Use Pi's real `ModelRuntime` with an `InMemoryCredentialStore` and a provider the test defines, and `createAgentRuntime` with the real SDK for resource loading. Do not rebuild them from `vi.fn()` or `{} as`.
- Seed history by running turns against the model, not by writing entries.
- Client tests build session documents with `packages/web/tests/support/session.ts`, never with cast literals.
- Do not commit recorded output such as snapshots or golden files.

## Behavior E2E

`tests/e2e/harness` owns the system under test. Specs never start processes or write app state.

- Each Playwright worker runs its own production server, scripted model, and `HOME` on free ports. The server reaches the model through Pi's `models.json`.
- Script each model turn before the message that causes it: `reply`, `useTools`, `fail`, or `hold`. `model.requests` is what the model received. An unscripted request, or a scripted turn never used, fails the test.
- Every test gets a fresh project opened through the UI. Set its contents with `test.use({projectFiles, projectGit, projectSkills})`.
- Locate elements by role, label, or text. A control that has no accessible name is an accessibility bug in the component.
- Retries are off. Run a new test with `--repeat-each=5` before relying on it.
- `SUPERNOVA_E2E_SKIP_BUILD=1` reuses the last build; only use it when you have changed tests, not source.

## Integration

- Build the runtime with `tests/support/session-runtime.ts` and observe it with `observe()`.
- Use `tests/support/runtime-server.ts` when payload parsing, error tags, or replication are part of the behavior. A remote state member holds a value only while subscribed, so subscribe before reading it.

## When to run

- Before handing work back: `typecheck`, `lint`, `prettier`, and `test`. Add `test:e2e` for changes to the client, server, contracts, or a user flow, and `test:timeline` only for changes to timeline rendering, animation, or interaction.
- CI runs `test` and `test:e2e` on every pull request.
