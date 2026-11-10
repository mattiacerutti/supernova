import type {Contract, Reference} from "@earendil-works/chord";
import {PluginError} from "@earendil-works/chord";

export function TaggedError<const Tag extends string>(tag: Tag) {
  return class extends PluginError {
    public static readonly tags: readonly Tag[] = [tag];
    declare public readonly code: Tag;

    public constructor(fields: {readonly message: string; readonly cause?: unknown}) {
      super(tag, fields.message);
      this.name = tag;
      // Chord sends only the code and message; the cause stays in the server log.
      if (fields.cause !== undefined) this.cause = fields.cause;
    }
  };
}

export interface DeclaredErrors<Code extends string = string> {
  readonly tags: readonly Code[];
  [Symbol.hasInstance](value: unknown): boolean;
}

export type CodeOf<E extends DeclaredErrors> = E["tags"][number];

export function errorUnion<const M extends readonly DeclaredErrors[]>(...members: M): DeclaredErrors<CodeOf<M[number]>> {
  return {
    tags: members.flatMap((member) => member.tags) as CodeOf<M[number]>[],
    [Symbol.hasInstance]: (value: unknown) => members.some((member) => value instanceof member),
  };
}

type MethodsOf<C extends Contract> =
  Reference<C> extends infer R ? (R extends unknown ? {[K in keyof R]: R[K] extends (...args: never[]) => Promise<unknown> ? K : never}[keyof R] & string : never) : never;

/** What each method may fail with besides `internal`. */
export type Errors<C extends Contract> = Partial<Record<Exclude<MethodsOf<C>, "retry" | "release">, DeclaredErrors>>;

export function failureOf<E extends DeclaredErrors>(cause: unknown, errors: E): CodeOf<E> | undefined {
  // A client receives a plain `PluginError`, never the subclass.
  if (!(cause instanceof PluginError)) return undefined;
  return (errors.tags as readonly string[]).includes(cause.code) ? (cause.code as CodeOf<E>) : undefined;
}
