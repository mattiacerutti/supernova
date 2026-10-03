import {createContext} from "react";
import type {RuntimeClient} from "@/rpc/transport/runtime-client";

// eslint-disable-next-line react-refresh/only-export-components -- Context belongs to this provider; changes also invalidate its consumers.
export const RuntimeContext = createContext<RuntimeClient | null>(null);

interface RuntimeProviderProps {
  readonly children: React.ReactNode;
  readonly runtime: RuntimeClient;
}

/** Makes the app-owned runtime connection available without taking ownership of its lifecycle. */
export default function RuntimeProvider(props: RuntimeProviderProps) {
  const {children, runtime} = props;

  return <RuntimeContext value={runtime}>{children}</RuntimeContext>;
}
