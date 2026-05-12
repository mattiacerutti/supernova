import {Schema} from "effect";

/** User-authored message that starts a session turn. */
export const AgentSessionUserMessage = Schema.Struct({
  /** Stable message identifier. */
  id: Schema.String,
  /** User-authored text content. */
  content: Schema.String,
  /** ISO timestamp for when the message was sent or created. */
  timestamp: Schema.optional(Schema.String),
});

export type IAgentSessionUserMessage = typeof AgentSessionUserMessage.Type;
