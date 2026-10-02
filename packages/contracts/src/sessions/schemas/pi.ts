import {Schema} from "effect";

export type {AssistantMessage, ImageContent, TextContent, ToolCall, ToolResultMessage, UserMessage as PiUserMessage} from "@earendil-works/pi-ai";
export type {AgentState, CompactionStatus, EntryRecord, LiveState, ToolSlot, UsageState} from "@earendil-works/pi-durable";
export type {Op as StateOp} from "@earendil-works/chord/delta";

/**
 * A value Pi owns, carried as-is. Pi defines its shape and every Pi value is strict JSON, so the codec checks only
 * that it is JSON; the type is Pi's.
 */
export function PiJson<T>(): Schema.Codec<T> {
  return Schema.Json as unknown as Schema.Codec<T>;
}
