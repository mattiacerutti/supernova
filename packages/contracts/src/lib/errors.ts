/** Features throw the class; the `_tag` is what crosses the wire as `code` and what clients branch on. */
export function TaggedError<const Tag extends string>(tag: Tag) {
  return class extends Error {
    public readonly _tag: Tag = tag;

    public constructor(fields: {readonly message: string; readonly cause?: unknown}) {
      super(fields.message, fields.cause === undefined ? undefined : {cause: fields.cause});
      this.name = tag;
    }
  };
}

export type TaggedErrorInstance = Error & {readonly _tag: string};

/** A union of contract errors as one value: `cause instanceof Union` matches any member, and narrows to the union. */
export interface ErrorUnion<E extends TaggedErrorInstance> {
  [Symbol.hasInstance](value: unknown): value is E;
}

export type ErrorValue = (abstract new (...args: never[]) => TaggedErrorInstance) | ErrorUnion<TaggedErrorInstance>;

export type ErrorOf<V extends ErrorValue> = V extends abstract new (...args: never[]) => infer E ? E : V extends ErrorUnion<infer E> ? E : never;

/** `export const X = errorUnion(A, B); export type X = ErrorOf<typeof X>;` */
export function errorUnion<const M extends readonly ErrorValue[]>(...members: M): ErrorUnion<ErrorOf<M[number]>> {
  return {[Symbol.hasInstance]: (value: unknown): value is ErrorOf<M[number]> => members.some((member) => value instanceof member)};
}

/** Every undeclared failure on the wire. Its message is the cause's; the cause stays in the server log. */
export class GenericError extends TaggedError("GenericError") {}
