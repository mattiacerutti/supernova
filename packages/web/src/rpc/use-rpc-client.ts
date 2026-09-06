import {use} from "react";
import {RpcClientContext} from "@/rpc/provider";
import type {RpcClient} from "@/rpc/transport/protocol";

/** Reads the app's RPC client, requiring its provider to be mounted above the caller. */
export function useRpcClient(): RpcClient {
  const client = use(RpcClientContext);
  if (!client) throw new Error("RPC client is not available.");
  return client;
}
