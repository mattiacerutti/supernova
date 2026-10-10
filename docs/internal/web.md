# Web

Conventions for `packages/web`. See [Coding standards](coding-standards.md) for shared TypeScript rules.

## Language and naming

- Components are PascalCase; hooks use descriptive `useX` names. Files stay kebab-case (`auth-wrapper.tsx`, `text-field.tsx`).
- Destructure props inside the body: `function Component(props: ComponentProps) { const {foo} = props; }`.

## Project structure and architecture

Feature-first, with a small set of typed shared folders. The layout follows [bulletproof-react](https://github.com/alan2207/bulletproof-react); check it before inventing a home for something.

```
src/
  api/          app-wide server data (configuration); same rules as a feature api/ folder
  app/          bootstrap and composition: app, command-palette/ (features composed into the palette), layout/ (shell + sidebar), providers/ (query, runtime client, session sync), routes/ (router + route components)
  components/   shared UI; layouts/ for page shells, ui/ for design-system primitives
  config/       runtime constants (app environment)
  features/     product areas: projects, sessions, settings, updates, workspace
  hooks/        shared hooks
  lib/          helpers used across features (cn, toast, project-paths) and preconfigured dependencies (diffs/, themes/)
  runtime/      the runtime connection: Chord service bindings over pi-client (transport/runtime-client.ts)
  stores/       app-wide Zustand stores
```

Features keep route-level components in `pages/` and helpers in `lib/`. Single components are default exports; props and options fields are `readonly`.

### Features

A feature owns a screen or a panel a user would name. Layout regions (sidebar, titlebar) and app-wide state are not features; they live in `app/` and `stores/`. A feature has only the folders it needs, from this fixed list:

| Folder        | Holds                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/`        | Server access. One file per operation, named after it (`get-session.ts`, `rename-session.ts`), exporting the hook and, when other code needs it, `getXQueryOptions`. `query-keys.ts` holds one `xKeys` object per feature. Keep `@/runtime` imports here so components and hooks never see the transport. |
| `components/` | Feature UI. Subfolders are UI regions (`composer/`, `timeline/`); a file is either inside a region folder or shared by several regions, never a sibling of a folder that describes it.                                                                                                                    |
| `hooks/`      | Feature hooks that are not server access.                                                                                                                                                                                                                                                                 |
| `lib/`        | Domain logic that is not UI or React-specific: parsers, builders, mappers. The test for `lib` is whether the output stands on its own. A helper that only shapes one component's render input belongs in that component file.                                                                             |
| `pages/`      | Route-level components and anything only they compose (a settings section registry, for example).                                                                                                                                                                                                         |
| `stores/`     | Feature-scoped Zustand stores. File `x-store.ts` exports `useXStore`. Stores hold client state and do no I/O; commands that change one live in `api/`.                                                                                                                                                    |
| `types/`      | Nouns of the domain shared by several files in the feature (`Session`, `Project`, `TimelineItem`). A type that describes one component's props or one function's input lives with that component or function, however many files import it.                                                               |

Cross-feature imports are limited to another feature's `components/` and `types/`; its `api/`, `hooks/`, `lib/`, `pages/`, and `stores/` are private. Shared code under `api/`, `components/`, `config/`, `hooks/`, `lib/`, and `stores/` never imports from `features/`; composition happens in `app/`. ESLint enforces both rules and kebab-case filenames.

Keep folders small enough to read at a glance; around five loose files is the point to group. Group by what the files are for, and reuse the same names at every level so a concern can be traced by name: `sessions` uses `composer/`, `conversation/`, `sidebar/`, and `timeline/` under `api/`, `components/`, `hooks/`, `lib/`, and `stores/` alike, and inside those `editor/`, `toolbar/`, `rows/`, `work/`, and so on. Files shared by several subfolders stay at the parent level; that is the only reason a file sits beside folders. `components/ui` and `app/` are exempt: one is a flat catalogue by design, the other is bootstrap.

A helper earns a place in `lib/` when several features use it. Something used by one feature belongs in that feature's `lib/`, even if it looks generic.

## Code standards

- Keep components small and focused; compose smaller pieces instead of growing prop lists and nested conditionals. Extract reusable UI into shared components and typed props interfaces.
- Co-locate state with its owner and derive computed values instead of storing them. Do not call `useEffect` directly.
- The web build enables React Compiler. Avoid `useMemo` and `useCallback` unless there is a specific need; React 19 alone does not provide automatic memoization.
- React 19 accepts refs as props. Avoid `forwardRef` unless required for interop.
- Avoid prop drilling; lift shared data to a feature-level context or custom hook. Keep hook names descriptive (`useLoginWithEmail`, `useAuthStatus`). The app environment is a constant from `@/config/app-environment`, never a prop.
- Avoid duplicating mutation result data into local state when it can be derived from the mutation result.

### Components and hooks

- Default-export UI components as `export default function Component(props: ComponentProps) { ... }`; define handlers as `const handleX = () => {}` inside the component. Compound components with several named parts (`Menu`/`MenuItem`, `SidebarLayout`/`SidebarLayoutSidebar`) use named exports.
- Every component has an `interface XProps` with `readonly` fields directly above it; no inline `props: {…}` types. Hook options are `interface UseXOptions`.
- Layouts are compound components with children and part components, not render-prop slots.
- A component whose props grow past a handful, or that would take a "controller" object, reads from a feature context instead (`ComposerContext` from `useComposer`).
- Hooks that hand back DOM handlers return one spreadable `…Props` object (`useInlineRename().inputProps`), not a list of callbacks.
- Do not add hooks that only re-export store selectors; call the store.
- Keep components under roughly 250 lines. Split by extracting a part component or a behavior hook.
- In files with multiple components and helpers, order declarations from top to bottom as helpers, non-exported components, then exported component.
- Prefer shared components before creating feature-local variants; only fork when the shared version cannot be extended cleanly.
- When you need to render conditional UI, prefer `condition && <Component />` over `condition ? <Component /> : null`.
- Keep components in separate files unless they are small, deeply related implementation details of the parent component.

### UI and Styling rules

- Prefer primitives from `@/components/ui` before creating custom UI or using default html elements.
- `components/ui` holds design-system primitives only: controls and surfaces that make sense in any feature. A component that exists for one feature's screen lives in that feature, even when it is built like a primitive; promote it when a second feature needs it.
- Only override primitive styles such as hover effects, text colors, spacing, or borders if explicitly requested by the user.
- When designing new UI, respect the app's existing design language for colors, typography, icon/text sizes, layout positioning, interaction flows, motion, and animation timing.
- Use semantic tailwind utilities (`text-xs`, `p-2`, `rounded-full`, etc.) over arbitrary pixel/rem size. Avoid things like `text-[10px]`, `p-[1.3rem]`, `rounded-[13px]`.
- Use the shared `cn` helper from `@/lib/cn` for conditional class names so `clsx` handles conditions and `tailwind-merge` resolves conflicting Tailwind utilities.
- For multi-step modal/dialog flows, prefer one shared dialog shell with swapped content instead of multiple dialogs that close/open between steps.

### Runtime hooks

- Get the runtime connection with `useRuntime()` (or take a `RuntimeClient` parameter in an options builder, like `listProjectSessionsQueryOptions(runtime, projectPath)`). It has one member per runtime service (`runtime.sessions`, `runtime.sessionRuntime`, `runtime.workspace`, …), whose methods take Chord's `Context` last as the contracts declare.
- Calls return `ServiceResult`s. In React Query functions, `unwrap()` from `@/runtime/runtime-result` turns a failure into a thrown `RuntimeError`. Branch on its code with `runtimeError<Service["method"]>(error)?.code`, which is typed as the method's declared error tags plus `"GenericError"`; a `Record<FailureCode<…>, string>` of messages fails to compile when the contract gains an error.
- Follow replicated state (`runtime.workspace.terminals`, `runtime.providers.logins`, `runtime.sessions.directory`, `runtime.sessionRuntime.session`) with `subscribe`, which delivers the current value at once.
- Sessions: `runtime.sessions` for lifecycle and reads; `runtime.sessionRuntime` for the commands and document of the session the connection attached. Attaching is the caller's: `sessions.attach(id)` routes the connection, then `runtime.bindSessionRuntime()` points `sessionRuntime` at it and waits for its state. `attachSession` (`api/sessions-sync`) does both, in order, and attaches again after a reconnect; use it rather than attaching by hand. Session state reaches components through the sessions store, never straight from the runtime; see State management.
- Query keys come from the feature's `xKeys` object, shaped `[feature, ...scope]`, and are read from `queryOptions().queryKey` where an options object exists. Invalidate with the parent key (`sessionKeys.lists()`), never a literal array.

## Testing

See [Development](development.md#verification) for verification and the test workflow.

- Add tests only for important user-facing behavior, bug fixes, regression-prone flows, and critical lifecycle behavior that would be costly to break.
- Avoid overtesting hooks, small components, trivial rendering, styling, or implementation details unless they protect an important lifecycle or user-visible regression.
- Keep tests under `tests`, with paths aligned to the source feature or shared area they cover.

## State management

- Prefer local component state for UI-local state.
- Use Zustand for shared client state that spans multiple components or feature boundaries.
- Keep Zustand stores feature-scoped under `src/features/<feature>/stores`; app-wide state (settings, sidebar) lives in `src/stores`.
- Derive values from store state when possible instead of duplicating derived state.
- Store actions take data and change state. They do not take callbacks, navigate, show toasts, or otherwise reach into the UI; a component reads store state and reacts to it.
- Live session state has one home, `stores/sessions-store`, and one way in, `api/sessions-sync`:
  - `syncSessions` (started once in `app/providers/providers.tsx`) keeps the runtime's report of every open session (activity, setup step, problem, summary) in the store.
  - `followSession` reads a session's document into the store, then keeps it live while anyone follows it. `useFollowSession` follows the session a page shows.
  - The store also holds optimism: what the user did that the runtime does not show yet (`message`, `navigation`, `stopping`, `title`, …). A command patches its field when the user acts and clears it when it settles.
  - `lib/session-view` decides what is shown from the store: `sessionView` for a page, `sessionStatus` for a row, `projectSessions` for a listing. It is the only place optimism is applied. Components read it through `useSession` and `useSessionStatus` (`hooks/use-session`) and `useListProjectSessions`.
  - A new optimistic command adds a field to `SessionOptimism`, patches it in its command, and reads it in `lib/session-view`.
- React Query holds what is fetched on request: listings, models, suggestions, workspace data. Live session state is never written into it.
- Session listings and search are paged on the server: `useListProjectSessions` and `useSearchSessions` are infinite queries over cursors, and nothing loads every session to filter or slice it. Rows already loaded stay current from the store; a pin is optimism (`pinned`) like a rename (`title`).
- App-wide reactions to server state are in `app/providers/providers.tsx`: everything is read again after a reconnect, and workspace data after any run ends.

## UI language and design style

The app follows a **dark, minimal, professional developer-tool aesthetic**. The visual language is flat, muted, and content-focused: depth is created through layered neutral backgrounds and subtle white transparency overlays, not through shadows or vibrant accent colors. The palette is neutral-first, there is no brand accent color.

The goal is a smooth, polished, well-thought user experience. Interactions should feel intentional and carefully finished, with attention paid to small details like spacing, timing, hover states, empty states, loading states, and close/open transitions.

Spacing is compact and tight with small increments. Elevation is flat, depth is communicated only through background color shifts. Prefer soft, large rounding on major surfaces; medium rounding on interactive elements.

Avoid solid fill buttons unless there is a clear product reason.
