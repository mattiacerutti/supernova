import type {AssistantMessage, Message, TextContent, ImageContent} from "@earendil-works/pi-ai";
import type {HookRegistration, LiveState} from "@earendil-works/pi-durable";
import {CompactionTask, GenerationTask, hook, LiveDoc, ToolTask} from "@earendil-works/pi-durable";

/** One old-SDK handler, as Pi's loader collected it. */
export type Handler = (event: Record<string, unknown>, ctx: unknown) => unknown;

/** Delivers one old-SDK event to its handlers in registration order and collects what they return. */
export type Emit = (event: string, fields: Record<string, unknown>) => Promise<unknown[]>;

/**
 * Old-SDK events this bridge delivers, and what delivers them (see `eventHooks`). Any other subscribed event is reported
 * once as not delivered, so an extension never believes it is hooked into something that never fires.
 *
 * Not deliverable from engine hooks: `message_update` and `tool_execution_update` (streaming deltas), `input` (the TUI's
 * editor), `session_compact` (the engine offers no hook after a summary is placed), `agent_before_settle` and the
 * `turn_end` result (the old loop's follow-up queue), and the session tree, fork, and info events (old-SDK session
 * objects). `before_agent_start` is delivered but its result (a prompt or system prompt rewrite) is not applied.
 */
export const DELIVERED_EVENTS = new Set([
  "session_start",
  "session_shutdown",
  "context",
  "before_agent_start",
  "agent_start",
  "agent_end",
  "agent_settled",
  "turn_start",
  "turn_end",
  "message_start",
  "message_end",
  "tool_call",
  "tool_result",
  "tool_execution_start",
  "tool_execution_end",
  "session_before_compact",
]);

type ToolReplacement = {content?: (TextContent | ImageContent)[]; details?: unknown; isError?: boolean} | undefined;

/**
 * Engine hooks that fire the old SDK's agent events. The old loop fired them around one agent run; the engine exposes
 * requests, responses, tool calls, and compactions, so each old event is placed at the closest engine moment:
 *
 * - a run's first request → `before_agent_start`, `agent_start`; every request → `context`
 * - every model response → `turn_start`, `message_start`, `message_end`, `turn_end`
 * - a final answer → `agent_end`, `agent_settled`
 * - every tool call → `tool_call`, `tool_execution_start`, (execute), `tool_execution_end`, `tool_result`
 * - a compaction → `session_before_compact`, which may cancel it or supply the summary
 */
export function eventHooks(subscribed: ReadonlySet<string>, emit: Emit): HookRegistration[] {
  const has = (...events: string[]) => events.some((event) => subscribed.has(event));
  const hooks: HookRegistration[] = [];

  if (has("context", "before_agent_start", "agent_start", "turn_start", "turn_end", "message_start", "message_end", "agent_end", "agent_settled")) {
    // Turn numbering is per conversation. A run is identified by the inputs it answers (`pi.live.run.inputs`); its first
    // request is the one that first sees them.
    const turns = new Map<number, number>();
    const runs = new Set<string>();
    hooks.push(
      hook(GenerationTask, {
        beforeRequest: async (request, api, context) => {
          let messages = [...request.messages] as Message[];
          const live = (await api.snapshot(LiveDoc, api.conversationId, context)) as LiveState | undefined;
          const runKey = live?.run && `${api.conversationId}:${live.run.inputs.join(",")}`;
          if (runKey && !runs.has(runKey)) {
            runs.add(runKey);
            const input = messages.findLast((message) => message.role === "user");
            const prompt =
              input === undefined ? "" : typeof input.content === "string" ? input.content : input.content.map((part) => (part.type === "text" ? part.text : "")).join("");
            await emit("before_agent_start", {prompt, systemPrompt: "", systemPromptOptions: {}});
            await emit("agent_start", {});
          }
          for (const result of await emit("context", {messages})) {
            const replaced = (result as {messages?: Message[]} | undefined)?.messages;
            if (replaced) messages = replaced;
          }
          await emit("turn_start", {turnIndex: turns.get(api.conversationId) ?? 0, timestamp: Date.now()});
          return {messages};
        },
        afterResponse: async (message, api) => {
          const turnIndex = turns.get(api.conversationId) ?? 0;
          turns.set(api.conversationId, turnIndex + 1);
          await emit("message_start", {message});
          await emit("message_end", {message});
          await emit("turn_end", {turnIndex, message, toolResults: [], messageEntryId: "", toolResultEntryIds: []});
        },
        onYield: async (answer: AssistantMessage) => {
          await emit("agent_end", {messages: [answer]});
          await emit("agent_settled", {});
          return undefined;
        },
      })
    );
  }

  if (has("tool_call", "tool_result", "tool_execution_start", "tool_execution_end")) {
    hooks.push(
      hook(ToolTask, {
        beforeTool: async (call) => {
          // Old handlers mutate `event.input` in place to change arguments.
          const args = structuredClone(call.arguments) as Record<string, unknown>;
          const results = await emit("tool_call", {toolCallId: call.id, toolName: call.name, input: args});
          const blocked = results.find((result) => (result as {block?: boolean} | undefined)?.block) as {reason?: string} | undefined;
          if (blocked) return {block: blocked.reason ?? "Blocked by an extension."};
          await emit("tool_execution_start", {toolCallId: call.id, toolName: call.name, args});
          return {arguments: args as never};
        },
        afterTool: async (call, result) => {
          await emit("tool_execution_end", {
            toolCallId: call.id,
            toolName: call.name,
            result: {content: result.content ?? [], details: result.details},
            isError: result.isError ?? false,
          });
          let current = result;
          for (const replaced of (await emit("tool_result", {
            toolCallId: call.id,
            toolName: call.name,
            input: call.arguments,
            content: current.content ?? [],
            details: current.details,
            isError: current.isError ?? false,
          })) as ToolReplacement[]) {
            if (!replaced) continue;
            current = {
              ...current,
              ...(replaced.content ? {content: replaced.content} : {}),
              ...(replaced.isError === undefined ? {} : {isError: replaced.isError}),
              ...(replaced.details === undefined ? {} : {details: replaced.details as never}),
            };
          }
          return current;
        },
      })
    );
  }

  if (has("session_before_compact")) {
    hooks.push(
      hook(CompactionTask, {
        beforeCompact: async (compaction) => {
          const results = await emit("session_before_compact", {
            reason: compaction.reason,
            branchEntries: compaction.entries,
            customInstructions: compaction.instructions,
            willRetry: false,
            signal: new AbortController().signal,
            preparation: {messagesToSummarize: compaction.messages, firstKeptEntryId: String(compaction.firstKept)},
          });
          const decision = results.find((result) => result !== undefined) as {cancel?: boolean; compaction?: {summary?: string}} | undefined;
          if (decision?.cancel) return {decline: true};
          return decision?.compaction?.summary === undefined ? undefined : {summary: decision.compaction.summary};
        },
      })
    );
  }

  return hooks;
}
