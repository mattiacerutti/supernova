import {createContext} from "react";
import type {RpcClient} from "@/rpc/transport/protocol";
import type {SessionServicesClient} from "@/rpc/transport/session-services";

// eslint-disable-next-line react-refresh/only-export-components -- Context belongs to this provider; changes also invalidate its consumers.
export const RpcClientContext = createContext<RpcClient | null>(null);

// eslint-disable-next-line react-refresh/only-export-components -- Context belongs to this provider; changes also invalidate its consumers.
export const SessionServicesContext = createContext<SessionServicesClient | null>(null);

interface RpcProviderProps {
  readonly children: React.ReactNode;
  readonly client: RpcClient;
  readonly sessionServices: SessionServicesClient;
}

/** Makes the app-owned RPC client and session service connection available without taking ownership of their lifecycle. */
export default function RpcProvider(props: RpcProviderProps) {
  const {children, client, sessionServices} = props;

  return (
    <RpcClientContext value={client}>
      <SessionServicesContext value={sessionServices}>{children}</SessionServicesContext>
    </RpcClientContext>
  );
}
