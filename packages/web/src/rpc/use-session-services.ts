import {use} from "react";
import {SessionServicesContext} from "@/rpc/provider";
import type {SessionServicesClient} from "@/rpc/transport/session-services";

/** Reads the app's session service connection, requiring its provider to be mounted above the caller. */
export function useSessionServices(): SessionServicesClient {
  const services = use(SessionServicesContext);
  if (!services) throw new Error("Session services are not available.");
  return services;
}
