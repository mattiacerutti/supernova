import * as Rpc from "effect/unstable/rpc/Rpc";
import {
  ProjectSessionArchiveError,
  ProjectSessionArchivePayload,
  ProjectSessionArchiveResult,
  ProjectSessionsListError,
  ProjectSessionsListPayload,
  ProjectSessionsListResult,
} from "@pi-desktop/contracts/projects/procedures";

export const ProjectSessionsListRpc = Rpc.make("listProjectSessions", {
  error: ProjectSessionsListError,
  payload: ProjectSessionsListPayload,
  success: ProjectSessionsListResult,
});

export const ProjectSessionArchiveRpc = Rpc.make("archiveProjectSession", {
  error: ProjectSessionArchiveError,
  payload: ProjectSessionArchivePayload,
  success: ProjectSessionArchiveResult,
});

export const ProjectRpcs = [ProjectSessionsListRpc, ProjectSessionArchiveRpc] as const;
