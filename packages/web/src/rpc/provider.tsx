import {createContext} from "react";
import type {RpcClient} from "@/rpc/transport/protocol";

// eslint-disable-next-line react-refresh/only-export-components -- Context belongs to this provider; changes also invalidate its consumers.
export const RpcClientContext = createContext<RpcClient | null>(null);

interface RpcProviderProps {
  readonly children: React.ReactNode;
  readonly client: RpcClient;
}

/** Makes the app-owned RPC client available without taking ownership of its lifecycle. */
export default function RpcProvider(props: RpcProviderProps) {
  const {children, client} = props;

  return <RpcClientContext value={client}>{children}</RpcClientContext>;
}
