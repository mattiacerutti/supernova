import {z} from "zod";
import {TaggedError} from "@supernova/contracts/lib/errors";
import {OutgoingMessage, SessionWorkspaceSelection} from "../schemas";

export const CreateSessionPayload = z.object({
  /** Client-chosen id for the new session; must be unused. The client mints it so the session can be shown before the server replies. */
  id: z.string(),
  message: OutgoingMessage.optional(),
  projectPath: z.string(),
  workspace: SessionWorkspaceSelection.optional(),
});

export class CreateSessionError extends TaggedError("CreateSessionError") {}

export type CreateSessionPayload = z.infer<typeof CreateSessionPayload>;
