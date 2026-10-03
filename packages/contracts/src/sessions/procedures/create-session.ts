import {z} from "zod";
import {struct, TaggedError} from "@supernova/contracts/runtime/schemas";
import {OutgoingMessage, SessionWorkspaceSelection} from "../schemas";

export const CreateSessionPayload = struct({
  /** Client-chosen id for the new session; must be unused. The client mints it so the session can be shown before the server replies. */
  id: z.string(),
  /** First message, started as the session's first turn. The session is removed again if it cannot start. */
  message: OutgoingMessage.optional(),
  projectPath: z.string(),
  /** Defaults to the project's own checkout. */
  workspace: SessionWorkspaceSelection.optional(),
});

export class CreateSessionError extends TaggedError("CreateSessionError") {}

export type CreateSessionPayload = z.infer<typeof CreateSessionPayload>;
