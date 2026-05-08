import {Layer} from "effect";
import {SessionsService} from "@pi-desktop/agent-runtime/services/sessions/sessions-service";
import {getSession} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/get-session";
import {listSessionModels} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/list-session-models";
import {sendSessionMessage} from "@pi-desktop/agent-runtime/providers/pi/sessions/operations/send-session-message";

export const PiSessionsLive = Layer.succeed(SessionsService, {
  get: getSession,
  listModels: listSessionModels,
  sendMessage: sendSessionMessage,
});
