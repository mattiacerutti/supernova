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

/**
 * What every failure a service did not declare becomes on the wire: a bug, an unexpected I/O failure, an invalid
 * request. Its message is the cause's; the cause itself stays in the server log.
 */
export class GenericError extends TaggedError("GenericError") {}
