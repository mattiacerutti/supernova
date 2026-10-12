import {use} from "react";
import {RuntimeContext} from "@/runtime/provider";
import type {RuntimeClient} from "@/runtime/transport/runtime-client";

/** Reads the app's runtime connection, requiring its provider to be mounted above the caller. */
export function useRuntime(): RuntimeClient {
  const runtime = use(RuntimeContext);
  if (!runtime) throw new Error("The runtime connection is not available.");
  return runtime;
}
