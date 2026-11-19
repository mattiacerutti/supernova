import {ChordError} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";

export function isOwner(principal: RuntimePrincipal | undefined): boolean {
  return principal?.kind === "owner";
}

export function forbidden(message: string): ChordError {
  return new ChordError({code: "forbidden", message});
}

export function expectVariant<R extends {readonly variant: unknown}, const V extends Exclude<R["variant"], undefined>>(ref: R, variant: V): Extract<R, {readonly variant: V}> {
  if (ref.variant !== variant) throw new ChordError({code: "invalid", reason: "member", message: `Expected the ${String(variant)} variant, got ${String(ref.variant)}.`});
  return ref as Extract<R, {readonly variant: V}>;
}
