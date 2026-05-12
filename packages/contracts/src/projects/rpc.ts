import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  AgentProjectSessionArchiveError,
  AgentProjectSessionArchivePayload,
  AgentProjectSessionArchiveResult,
  AgentProjectSessionsListError,
  AgentProjectSessionsListPayload,
  AgentProjectSessionsListResult,
} from "@pi-desktop/contracts/projects/procedures";

export const AgentProjectSessionsListRpc = Rpc.make("listProjectSessions", {
  error: AgentProjectSessionsListError,
  payload: AgentProjectSessionsListPayload,
  success: AgentProjectSessionsListResult,
});

export const AgentProjectSessionArchiveRpc = Rpc.make("archiveProjectSession", {
  error: AgentProjectSessionArchiveError,
  payload: AgentProjectSessionArchivePayload,
  success: AgentProjectSessionArchiveResult,
});

export const AgentProjectRpcs = [AgentProjectSessionsListRpc, AgentProjectSessionArchiveRpc] as const;
