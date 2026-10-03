import type {Context} from "@earendil-works/chord";
import {defineService} from "@earendil-works/chord";
import type {
  ProjectSessionArchiveError,
  ProjectSessionArchivePayload,
  ProjectSessionArchiveResult,
  ProjectSessionsListPayload,
  ProjectSessionsListResult,
} from "@supernova/contracts/projects/procedures";
import type {ServiceResult} from "@supernova/contracts/runtime/services";

/** Sessions as they are listed under a project. */
export interface ProjectsService {
  listSessions(payload: ProjectSessionsListPayload, context: Context): Promise<ServiceResult<ProjectSessionsListResult>>;
  /** Archives a session: its shells close, its work stops, it leaves the listing, and its worktree goes when asked. */
  archiveSession(payload: ProjectSessionArchivePayload, context: Context): Promise<ServiceResult<ProjectSessionArchiveResult, ProjectSessionArchiveError>>;
}

export const ProjectsService = defineService<ProjectsService>("supernova.projects");
