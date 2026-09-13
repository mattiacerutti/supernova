# Web

Conventions for `packages/web`. See [Coding standards](coding-standards.md) for shared TypeScript rules.

## Language and naming

- Components are PascalCase; hooks use descriptive `useX` names. Files stay kebab-case (`auth-wrapper.tsx`, `text-field.tsx`).
- Destructure props inside the body: `function Component(props: ComponentProps) { const {foo} = props; }`.

## Project structure and architecture

- Maintain feature-first organization under `src/features/<feature>`.
- Feature code lives under `src/features/<feature>/{pages,components,hooks,stores,types,lib,utils}` as needed.
- Route/page-level components live in `src/features/<feature>/pages`.
- Feature-specific UI lives in `src/features/<feature>/components`, grouped by domain when a flat components folder becomes hard to navigate.
- Feature hooks live in `src/features/<feature>/hooks`.
- API hooks live in `src/features/<feature>/hooks/api`, grouped by domain when a feature has multiple query/mutation families.
- Feature `lib` folders contain feature-specific domain logic, state transformations, mappers, parsers, and other meaningful behavior that is not UI or React-specific. The test for `lib` is whether the output stands on its own: a tree, a parsed patch, a mapped record that any consumer could use. A helper that only shapes one component's render input from that component's own state belongs in the component file, even when it is pure; it has no meaning without the component and moving it out only hides where it is used.
- Feature `utils` folders contain small, generic helpers for that feature, such as formatting or simple value normalization. If a utility starts encoding domain behavior, move it to `lib`.
- Shared reusable UI lives in `src/components`; shared UI primitives live in `src/components/ui`.
- Shared non-UI utilities live in `src/lib`.
- App-level composition, routing, and shell code lives in `src/app`.
- RPC transport/client code lives in `src/rpc`.

## Code standards

- Keep components small and focused; compose smaller pieces instead of growing prop lists and nested conditionals. Extract reusable UI into shared components and typed props interfaces.
- Co-locate state with its owner and derive computed values instead of storing them. Do not call `useEffect` directly.
- The web build enables React Compiler. Avoid `useMemo` and `useCallback` unless there is a specific need; React 19 alone does not provide automatic memoization.
- React 19 accepts refs as props. Avoid `forwardRef` unless required for interop.
- Avoid prop drilling; lift shared data to a feature-level context or custom hook. Keep hook names descriptive (`useLoginWithEmail`, `useAuthStatus`).
- Avoid duplicating mutation result data into local state when it can be derived from the mutation result.

### Components and hooks

- Default-export UI components as `export default function Component(props: ComponentProps) { ... }`; define handlers as `const handleX = () => {}` inside the component.
- If a component has a named props type or interface, place that type directly above the component declaration.
- In files with multiple components and helpers, order declarations from top to bottom as helpers, non-exported components, then exported component.
- Prefer shared components before creating feature-local variants; only fork when the shared version cannot be extended cleanly.
- When you need to render conditional UI, prefer `condition && <Component />` over `condition ? <Component /> : null`.
- Keep components in separate files unless they are small, deeply related implementation details of the parent component.

### UI and Styling rules

- Prefer primitives from `@/components/ui` before creating custom UI or using default html elements.
- Only override primitive styles such as hover effects, text colors, spacing, or borders if explicitly requested by the user.
- When designing new UI, respect the app's existing design language for colors, typography, icon/text sizes, layout positioning, interaction flows, motion, and animation timing.
- Use semantic tailwind utilities (`text-xs`, `p-2`, `rounded-full`, etc.) over arbitrary pixel/rem size. Avoid things like `text-[10px]`, `p-[1.3rem]`, `rounded-[13px]`.
- Use the shared `cn` helper from `@/lib/cn` for conditional class names so `clsx` handles conditions and `tailwind-merge` resolves conflicting Tailwind utilities.
- For multi-step modal/dialog flows, prefer one shared dialog shell with swapped content instead of multiple dialogs that close/open between steps.

### RPC hooks

- Use `effect-query` for RPC-backed React Query hooks.
- Prefer `eq.queryOptions` and `eq.mutationOptions` over manually wrapping RPC calls with an imperative client runner.
- Use `Effect.gen` for RPC effects and get the RPC client from `RpcProtocolClientService` so typed RPC failures are preserved.

## Testing

See [Development](development.md#verification) for verification and the test workflow.

- Add tests only for important user-facing behavior, bug fixes, regression-prone flows, and critical lifecycle behavior that would be costly to break.
- Avoid overtesting hooks, small components, trivial rendering, styling, or implementation details unless they protect an important lifecycle or user-visible regression.
- Keep tests under `tests`, with paths aligned to the source feature or shared area they cover.

## State management

- Prefer local component state for UI-local state.
- Use Zustand for shared client state that spans multiple components or feature boundaries.
- Keep Zustand stores feature-scoped under `src/features/<feature>/stores` unless the state is truly app-wide.
- Derive values from store state when possible instead of duplicating derived state.

## UI language and design style

The app follows a **dark, minimal, professional developer-tool aesthetic**. The visual language is flat, muted, and content-focused: depth is created through layered neutral backgrounds and subtle white transparency overlays, not through shadows or vibrant accent colors. The palette is neutral-first, there is no brand accent color.

The goal is a smooth, polished, well-thought user experience. Interactions should feel intentional and carefully finished, with attention paid to small details like spacing, timing, hover states, empty states, loading states, and close/open transitions.

Spacing is compact and tight with small increments. Elevation is flat, depth is communicated only through background color shifts. Prefer soft, large rounding on major surfaces; medium rounding on interactive elements.

Avoid solid fill buttons unless there is a clear product reason.
