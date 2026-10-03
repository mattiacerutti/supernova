import type {SessionServicesClient} from "@/rpc/transport/session-services";
import {timelineServer} from "@e2e/mocks/timeline-rpc-client";

export type {AttachedSession, SessionServicesClient} from "@/rpc/transport/session-services";

/** The app's session services over the in-browser timeline server. */
export async function getSessionServicesClient(): Promise<SessionServicesClient> {
  return timelineServer().services();
}
