import type {Context} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {
  ProjectSessionArchiveError,
  ProjectSessionArchivePayload,
  ProjectSessionArchiveResult,
  ProjectSessionPinPayload,
  ProjectSessionsListPayload,
  ProjectSessionsListResult,
  ProjectSessionsSearchPayload,
  ProjectSessionsSearchResult,
} from "@supernova/contracts/services/projects/procedures";
import type {ServiceResult} from "@supernova/contracts/lib/protocol";

/** Sessions as they are listed under a project. */
export interface ProjectsService {
  /** One page of a project's sessions, pinned first, then newest. */
  listSessions(payload: ProjectSessionsListPayload, context: Context): Promise<ServiceResult<ProjectSessionsListResult>>;
  /** One page of sessions across projects whose title matches, newest first. */
  searchSessions(payload: ProjectSessionsSearchPayload, context: Context): Promise<ServiceResult<ProjectSessionsSearchResult>>;
  /** Pins or unpins a session in its project's listing. */
  pinSession(payload: ProjectSessionPinPayload, context: Context): Promise<ServiceResult<null>>;
  /** Archives a session: its shells close, its work stops, it leaves the listing, and its worktree goes when asked. */
  archiveSession(payload: ProjectSessionArchivePayload, context: Context): Promise<ServiceResult<ProjectSessionArchiveResult, ProjectSessionArchiveError>>;
}

export const ProjectsService = defineService<ProjectsService>("supernova.projects");
