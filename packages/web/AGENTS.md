# web package agents.md

## Language and naming

- Components/hooks are PascalCase; files stay kebab-case (`auth-wrapper.tsx`, `text-field.tsx`).
- Destructure props inside the body: `function Component(props: IComponentProps) { const {foo} = props; }`.

## Project structure and architecture

- Maintain feature-first organization under `src/features/<feature>`.
- Feature code lives under `src/features/<feature>/{pages,components,hooks,stores,types}` as needed.
- Route/page-level components live in `src/features/<feature>/pages`.
- Feature-specific UI lives in `src/features/<feature>/components`, grouped by domain when useful.
- Feature hooks live in `src/features/<feature>/hooks`.
- API hooks live in `src/features/<feature>/hooks/api`, grouped by domain when a feature has multiple query/mutation families.
- Shared reusable UI lives in `src/components`; shared UI primitives live in `src/components/ui`.
- Shared non-UI utilities live in `src/lib`.
- App-level composition, routing, and shell code lives in `src/app`.
- RPC transport/client code lives in `src/rpc`.

## Components and hooks

- Default-export UI components as `export default function Component(props: IProps) { ... }`; define handlers as `const handleX = () => {}` inside the component.
- Prefer shared components before creating feature-local variants; only fork when the shared version cannot be extended cleanly.
- When you need to render conditional UI, prefer `condition && <Component />` over `condition ? <Component /> : null`.
- Keep components in separate files unless they are small, deeply related implementation details of the parent component.

## RPC hooks

- Use `effect-query` for RPC-backed React Query hooks.
- Prefer `eq.queryOptions` and `eq.mutationOptions` over manually wrapping RPC calls with an imperative client runner.
- Use `Effect.gen` for RPC effects and get the RPC client from `AgentRpcProtocolClientService` so typed RPC failures are preserved.

## Code standards

- Keep components small and focused; compose smaller pieces instead of growing prop lists and nested conditionals. Extract reusable UI into shared components and typed props interfaces.
- Co-locate state with its owner and derive computed values instead of storing them. Keep `useEffect` scarce, with complete dependency arrays and cleanups for subscriptions/timeouts.
- In most cases React 19 auto-memoizes variables and functions, so avoid `useMemo` and `useCallback` unless you have a specific need or the operation is particularly performance-heavy.
- React 19 auto-forwards refs, so avoid `forwardRef` unless you have a rare interop need.
- Avoid prop drilling; lift shared data to a feature-level context or custom hook. Keep hook names descriptive (`useLoginWithEmail`, `useAuthStatus`).
- Avoid duplicating mutation result data into local state when it can be derived from the mutation result.

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

## UI and Styling rules

- Prefer primitives from `@/components/ui` before creating custom UI or using default html elements.
- Only override primitive styles such as hover effects, text colors, spacing, or borders if explicitly requested by the user.
- When designing new UI, respect the app's existing design language for colors, typography, icon/text sizes, layout positioning, interaction flows, motion, and animation timing.
- Use semantic tailwind utilities (`text-xs`, `p-2`, `rounded-full`, etc.) over arbitrary pixel/rem size. Avoid things like `text-[10px]`, `p-[1.3rem]`, `rounded-[13px]`.
- Use the shared `cn` helper from `@/lib/cn.ts` for conditional class names so `clsx` handles conditions and `tailwind-merge` resolves conflicting Tailwind utilities.
- For multi-step modal/dialog flows, prefer one shared dialog shell with swapped content instead of multiple dialogs that close/open between steps.
