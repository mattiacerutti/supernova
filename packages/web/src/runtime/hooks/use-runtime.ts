import {use} from "react";
import {RuntimeContext} from "@/runtime/provider";
import type {RuntimeClient} from "@/runtime/client";

export function useRuntime(): RuntimeClient {
  const runtime = use(RuntimeContext);
  if (!runtime) throw new Error("The runtime connection is not available.");
  return runtime;
}
