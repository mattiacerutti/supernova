import {Effect} from "effect";

/**
 * Runs a feature function at the RPC edge. Features throw the contract's error classes directly; `isDeclared`
 * recognizes them and anything else (a bug, an unexpected I/O failure) becomes `fallback`, so the client always
 * receives a declared error.
 */
export function run<A, E>(promise: () => Promise<A>, isDeclared: (cause: unknown) => cause is E, fallback: (cause: unknown) => E): Effect.Effect<A, E> {
  return Effect.tryPromise({
    try: promise,
    catch: (cause) => (isDeclared(cause) ? cause : fallback(cause)),
  });
}

/** Builds an `isDeclared` predicate from error classes. */
export function oneOf<const T extends readonly (abstract new (...args: never[]) => unknown)[]>(...classes: T) {
  return (cause: unknown): cause is InstanceType<T[number]> => classes.some((error) => cause instanceof error);
}

/** Like `run`, for feature functions that complete synchronously. */
export function runSync<A, E>(compute: () => A, isDeclared: (cause: unknown) => cause is E, fallback: (cause: unknown) => E): Effect.Effect<A, E> {
  return Effect.try({
    try: compute,
    catch: (cause) => (isDeclared(cause) ? cause : fallback(cause)),
  });
}
