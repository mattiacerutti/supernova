import type {Context} from "@earendil-works/chord/context";
import type {ErrorOf, ErrorValue, TaggedErrorInstance} from "@supernova/contracts/lib/errors";
import {GenericError} from "@supernova/contracts/lib/errors";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";
import type {z} from "zod";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";

/** Payloads cross a trust boundary, so each is parsed. `error` types the method's result. */
export interface Operation<P extends z.ZodType, R, E extends ErrorValue, C extends Context> {
  readonly payload: P;
  readonly run: (payload: z.infer<P>, ctx: C) => R | Promise<R>;
  readonly error?: E;
}

/** Chord carries only its own error codes, so a declared error travels as data; everything else is a `GenericError`. */
async function run<P extends z.ZodType, R, E extends ErrorValue, C extends Context>(
  operation: Operation<P, R, E, C>,
  input: unknown,
  ctx: C
): Promise<ServiceResult<R, ErrorOf<E>>> {
  // Clients see only the code and message; the cause (file paths, stack) stays in the server log.
  const fail = (error: TaggedErrorInstance) => {
    console.error(`[runtime] ${error._tag}: ${error.message}`, ...(error.cause === undefined ? [] : [error.cause]));
    return {ok: false, error: {code: error._tag, message: error.message}} as ServiceResult<R, ErrorOf<E>>;
  };

  const parsed = operation.payload.safeParse(input);
  if (!parsed.success) return fail(new GenericError({cause: parsed.error, message: "The request is invalid."}));

  try {
    const value = await operation.run(parsed.data, ctx);
    return {ok: true, value: (value === undefined ? null : value) as R};
  } catch (cause) {
    if (operation.error !== undefined && cause instanceof operation.error) return fail(cause as TaggedErrorInstance);
    return fail(new GenericError({cause, message: errorMessage(cause, "The operation failed.")}));
  }
}

/** `void` results go out as `null`: a method without a value still returns JSON. */
type Returned<R> = [R] extends [void] ? null : R;

export function method<P extends z.ZodType, R, E extends ErrorValue = never, C extends Context = Context>(
  operation: Operation<P, R, E, C>
): (payload: z.infer<P>, ctx: C) => Promise<ServiceResult<Returned<R>, ErrorOf<E>>> {
  return (payload, ctx) => run(operation, payload, ctx) as Promise<ServiceResult<Returned<R>, ErrorOf<E>>>;
}

export function action<R, E extends ErrorValue = never, C extends Context = Context>(operation: {
  readonly run: (ctx: C) => R | Promise<R>;
  readonly error?: E;
}): (ctx: C) => Promise<ServiceResult<Returned<R>, ErrorOf<E>>> {
  const nothing = {safeParse: () => ({success: true, data: null})} as unknown as z.ZodNull;
  return (ctx) => run({...operation, payload: nothing, run: (_payload, runCtx: C) => operation.run(runCtx)}, null, ctx) as Promise<ServiceResult<Returned<R>, ErrorOf<E>>>;
}
