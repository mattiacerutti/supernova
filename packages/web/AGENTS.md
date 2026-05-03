# web package agents.md

## Language and naming

- Components/hooks are PascalCase; files stay kebab-case (`auth-wrapper.tsx`, `text-field.tsx`).
- Destructure props inside the body: `function Component(props: IComponentProps) { const {foo} = props; }`.

## Components and hooks

- Default-export UI components as `export default function Component(props: IProps) { ... }`; define handlers as `const handleX = () => {}` inside the component.
- Prefer shared components before creating feature-local variants; only fork when the shared version cannot be extended cleanly.
- When you need to render conditional UI, prefer `condition && <Component />` over `condition ? <Component /> : null`.

## Code standards

- Keep components small and focused; compose smaller pieces instead of growing prop lists and nested conditionals. Extract reusable UI into shared components and typed props interfaces.
- Co-locate state with its owner and derive computed values instead of storing them. Keep `useEffect` scarce, with complete dependency arrays and cleanups for subscriptions/timeouts.
- In most cases React 19 auto-memoizes variables and functions, so avoid `useMemo` and `useCallback` unless you have a specific need or the operation is particularly performance-heavy.
- React 19 auto-forwards refs, so avoid `forwardRef` unless you have a rare interop need.
- Avoid prop drilling; lift shared data to a feature-level context or custom hook. Keep hook names descriptive (`useLoginWithEmail`, `useAuthStatus`).

## UI and Styling

- Use semantic tailwind utilities (`text-xs`, `p-2`, `rounded-full`, etc.) over arbitrary pixel/rem size. Avoid things like `text-[10px]`, `p-[1.3rem]`, `rounded-[13px]`.
- Use the shared `cn` helper from `@/lib/cn.ts` for conditional class names so `clsx` handles conditions and `tailwind-merge` resolves conflicting Tailwind utilities.
