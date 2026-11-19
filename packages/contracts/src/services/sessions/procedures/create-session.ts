import {obj, opt, type Static, str} from "@earendil-works/chord";
import {TaggedError} from "@supernova/contracts/lib/errors";
import {SessionWorkspaceSelection} from "@supernova/contracts/services/sessions/schemas";
import {OutgoingMessage} from "@supernova/contracts/services/chat/schemas";

export const CreateSessionPayload = obj({
  /** Minted by the client. */
  id: str(),
  message: opt(OutgoingMessage),
  projectPath: str(),
  workspace: opt(SessionWorkspaceSelection),
});

export class CreateSessionError extends TaggedError("CreateSessionError") {}

export type CreateSessionPayload = Static<typeof CreateSessionPayload>;
