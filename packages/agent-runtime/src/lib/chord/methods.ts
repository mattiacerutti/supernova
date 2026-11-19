import {PluginError} from "@earendil-works/chord";
import type {Context} from "@earendil-works/chord/context";
import {errorMessage} from "@supernova/agent-runtime/lib/errors";

type Returned<R> = [R] extends [void] ? null : R;

export function method<P, R, C extends Context = Context>(run: (payload: P, ctx: C) => R | Promise<R>): (payload: P, ctx: C) => Promise<Returned<R>> {
  return async (payload, ctx) => {
    try {
      return ((await run(payload, ctx)) ?? null) as Returned<R>;
    } catch (error) {
      // Chord sends only the code and message.
      const code = error instanceof PluginError ? error.code : "internal";
      console.error(`[runtime] ${code}: ${errorMessage(error, String(error))}`, ...(error instanceof Error && error.cause !== undefined ? [error.cause] : []));
      throw error;
    }
  };
}

export function action<R, C extends Context = Context>(run: (ctx: C) => R | Promise<R>): (ctx: C) => Promise<Returned<R>> {
  const served = method((_payload: null, ctx: C) => run(ctx));
  return (ctx) => served(null, ctx);
}
