/**
 * Base of the contract error classes: an `Error` with a stable `_tag`. Services return failures as data with the tag
 * as their `code` (see `ServiceResult`), so the class is what features throw and the tag is what clients branch on.
 */
export function TaggedError<const Tag extends string>(tag: Tag) {
  return class extends Error {
    public readonly _tag: Tag = tag;

    public constructor(fields: {readonly message: string; readonly cause?: unknown}) {
      super(fields.message, fields.cause === undefined ? undefined : {cause: fields.cause});
      this.name = tag;
    }
  };
}

/** An instance of a contract error class. */
export type TaggedErrorInstance = Error & {readonly _tag: string};

/** A union of contract errors as one value: `cause instanceof Union` matches any member, and narrows to the union. */
export interface ErrorUnion<E extends TaggedErrorInstance> {
  [Symbol.hasInstance](value: unknown): value is E;
}

/** The errors a service method declares, as one value: a contract error class, or an `ErrorUnion` of them. */
export type ErrorValue = (abstract new (...args: never[]) => TaggedErrorInstance) | ErrorUnion<TaggedErrorInstance>;

/** The error instances an `ErrorValue` matches. */
export type ErrorOf<V extends ErrorValue> = V extends abstract new (...args: never[]) => infer E ? E : V extends ErrorUnion<infer E> ? E : never;

/**
 * Names a method's errors as one value, declared next to its payload with a type of the same name:
 * `export const X = errorUnion(A, B); export type X = ErrorOf<typeof X>;`. Members may be classes or other unions.
 */
export function errorUnion<const M extends readonly ErrorValue[]>(...members: M): ErrorUnion<ErrorOf<M[number]>> {
  return {[Symbol.hasInstance]: (value: unknown): value is ErrorOf<M[number]> => members.some((member) => value instanceof member)};
}

/**
 * What every failure a service did not declare becomes on the wire: a bug, an unexpected I/O failure, an invalid
 * request. Its message is the cause's; the cause itself stays in the server log.
 */
export class GenericError extends TaggedError("GenericError") {}
