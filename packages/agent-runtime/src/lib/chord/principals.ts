import {ChordError} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";

export function isOwner(principal: RuntimePrincipal | undefined): boolean {
  return principal?.kind === "owner";
}

export function forbidden(message: string): ChordError {
  return new ChordError({code: "forbidden", message});
}
