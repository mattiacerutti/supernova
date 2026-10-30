# Web

Conventions for `packages/web`. See [Coding standards](coding-standards.md) for shared TypeScript rules.

## Language and naming

- Components are PascalCase; hooks use descriptive `useX` names. Files stay kebab-case (`auth-wrapper.tsx`, `text-field.tsx`).
- Destructure props inside the body: `function Component(props: ComponentProps) { const {foo} = props; }`.

## Project structure and architecture

Feature-first, with a small set of typed shared folders. The layout follows [bulletproof-react](https://github.com/alan2207/bulletproof-react); check it before inventing a home for something.

```
src/
  api/          app-wide server access; same conventions as feature api/
  app/          bootstrap, routing, layout, and feature composition
  components/   shared UI; layouts/ for shells, ui/ for design-system primitives
  config/       app environment and runtime constants
  features/     product areas
  hooks/        shared hooks
  lib/          cross-feature helpers and configured dependencies
  runtime/      server connection and transport
  stores/       app-wide client state
```

### Features

A feature owns a screen or a panel a user would name. Layout regions (sidebar, titlebar) and app-wide state are not features; they live in `app/` and `stores/`. A feature has only the folders it needs, from this fixed list:

- `api/`: one file per server operation, exporting its hook and reusable query-options builder when needed. Keep transport imports here and feature query keys in `query-keys.ts`.
- `components/`: UI grouped by region, such as `composer/` or `timeline/`.
- `hooks/`: React behavior other than server access.
- `lib/`: domain logic whose output stands on its own. Render-input helpers stay with their component.
- `pages/`: route components and things only they compose.
- `stores/`: feature-scoped client state; `x-store.ts` exports `useXStore`. Server commands belong in `api/`.
- `types/`: shared domain nouns, not props or function options; those stay with their owner even if exported.

Cross-feature imports are limited to another feature's `components/` and `types/`; its `api/`, `hooks/`, `lib/`, `pages/`, and `stores/` are private. Shared code under `api/`, `components/`, `config/`, `hooks/`, `lib/`, and `stores/` never imports from `features/`; composition happens in `app/`. ESLint enforces both rules and kebab-case filenames.

Group growing folders by concern around five loose files, reusing concern names across API, components, hooks, logic, and stores. A file belongs inside the folder describing it; only files shared by several subfolders stay at the parent. `components/ui` and `app/` are exempt: one is a flat catalog, the other is bootstrap.

A helper earns a place in `lib/` when several features use it. Something used by one feature belongs in that feature's `lib/`, even if it looks generic.

## Code standards

- Co-locate state with its owner and derive computed values instead of storing them. Do not call `useEffect` directly; follow the [no-use-effect skill](../../.agents/skills/no-use-effect/SKILL.md).
- The web build enables React Compiler. Avoid `useMemo` and `useCallback` unless there is a specific need; React 19 alone does not provide automatic memoization.
- React 19 accepts refs as props. Avoid `forwardRef` unless required for interop.
- The app environment comes from `@/config/app-environment`, never a prop.
- Avoid duplicating mutation result data into local state when it can be derived from the mutation result.

### Components and hooks

- Default-export UI components as `export default function Component(props: ComponentProps) { ... }`; define handlers as `const handleX = () => {}` inside the component. Compound components with several named parts (`Menu`/`MenuItem`, `SidebarLayout`/`SidebarLayoutSidebar`) use named exports.
- Every component has an `interface XProps` with `readonly` fields directly above it; no inline `props: {…}` types. Hook options are `interface UseXOptions`, also with readonly fields.
- Layouts are compound components with children and part components, not render-prop slots.
- Keep components focused. Use feature context when growing prop lists or prop drilling would otherwise lead to a "controller" object; split coherent UI and behavior rather than hiding complexity.
- Hooks that hand back DOM handlers return one spreadable `…Props` object (`useInlineRename().inputProps`), not a list of callbacks.
- Do not add hooks that only re-export store selectors; call the store.
- Keep components under roughly 250 lines. Split by extracting a part component or a behavior hook.
- In files with multiple components and helpers, order declarations from top to bottom as helpers, non-exported components, then exported component.
- When you need to render conditional UI, prefer `condition && <Component />` over `condition ? <Component /> : null`.
- Keep components in separate files unless they are small, deeply related implementation details of the parent component.

### UI and Styling rules

- Prefer primitives from `@/components/ui` before custom UI or default HTML controls. Only fork shared components when they cannot be extended cleanly.
- `components/ui` holds design-system primitives only: controls and surfaces that make sense in any feature. A component that exists for one feature's screen lives in that feature, even when it is built like a primitive; promote it when a second feature needs it.
- Only override primitive styles such as hover effects, text colors, spacing, or borders if explicitly requested by the user.
- Use semantic tailwind utilities (`text-xs`, `p-2`, `rounded-full`, etc.) over arbitrary pixel/rem size. Avoid things like `text-[10px]`, `p-[1.3rem]`, `rounded-[13px]`.
- Use the shared `cn` helper from `@/lib/cn` for conditional class names so `clsx` handles conditions and `tailwind-merge` resolves conflicting Tailwind utilities.
- For multi-step modal/dialog flows, prefer one shared dialog shell with swapped content instead of multiple dialogs that close/open between steps.

### Runtime hooks

- Obtain the connection with `useRuntime()`, or pass `RuntimeClient` into query-options builders. Keep calls behind the feature API boundary.
- Use `unwrap()` and the typed `runtimeError`/`FailureCode` helpers for result handling. Branch on declared codes, not message strings; keep exhaustive client handling aligned with contract changes.
- Subscribe where changing state is needed. The initial `undefined` is loading, not an authoritative empty result; reconnect delivers a fresh value. Hidden terminals should not keep receiving output.
- Reuse `followSession` and `withSessionRuntime` from `api/sessions-sync` to share and release holds. Components read the sessions store, not remote session state directly.
- Build query keys through the feature's `xKeys`, shaped `[feature, ...scope]`. Reuse `queryOptions().queryKey` and invalidate parent keys, never literal arrays.
- Prefetch data a component will need with `usePrefetchQuery`, not an effect. Use `queryClient.prefetchQuery` only from event handlers. A prefetch that nothing reads yet is dropped after the default `gcTime`, so set a longer `gcTime` on the prefetch when the page may open much later.

## Testing

See [Testing](testing.md).

- Keep tests under `tests`, with paths aligned to the source feature they cover. Shared builders live in `tests/support`.
- Do not unit-test hooks, small components, or rendering; cover them through the behavior suite.

## State management

- Prefer local component state for UI-local state.
- Use Zustand for shared client state that spans multiple components or feature boundaries.
- Keep Zustand stores feature-scoped under `src/features/<feature>/stores`; app-wide state (settings, sidebar) lives in `src/stores`.
- Derive values from store state when possible instead of duplicating derived state.
- Store actions take data and change state. They do not take callbacks, navigate, show toasts, or otherwise reach into the UI; a component reads store state and reacts to it.
- Live session state has one home, `stores/sessions-store`, and one way in, `api/sessions-sync`:
  - Share session subscriptions rather than opening a separate hold for every component. Directory summaries remain available for sessions whose full document is not being followed.
  - Keep authoritative updates separate from optimism: what the user did that the runtime does not show yet. Commands own the lifecycle of their pending intent and must reconcile it on success or failure.
  - Apply optimism only in `lib/session-view`, so pages, sidebar rows, and listings agree. Components consume those projections rather than reconstructing session state independently.
- React Query holds what is fetched on request: listings, models, suggestions, workspace data. Live session state is never written into it.
- Preserve server-side paging for listings and search; never load every session to filter or slice it. Already loaded rows reconcile against live state and pending intent.
- Put app-wide reactions in providers: refresh stale queries after reconnect and workspace data after runs end.
- Scope notices about a session's work to that session; retain them while another route is shown rather than losing or misattributing them. Composer and project failures stay app-wide.

## UI language and design style

The app follows a **dark, minimal, professional developer-tool aesthetic**. The visual language is flat, muted, and content-focused: depth is created through layered neutral backgrounds and subtle white transparency overlays, not through shadows or vibrant accent colors. The palette is neutral-first, there is no brand accent color.

The goal is a smooth, polished, well-thought user experience. Interactions should feel intentional and carefully finished, with attention paid to small details like spacing, timing, hover states, empty states, loading states, and close/open transitions.

Spacing is compact and tight with small increments. Elevation is flat, depth is communicated only through background color shifts. Prefer soft, large rounding on major surfaces; medium rounding on interactive elements.

Avoid solid fill buttons unless there is a clear product reason.
