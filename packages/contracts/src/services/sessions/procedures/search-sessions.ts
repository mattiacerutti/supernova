import {arr, int, nul, obj, opt, type Static, str, union} from "@earendil-works/chord";
import {SessionSummaryFields} from "@supernova/contracts/services/sessions/schemas";

export const SESSION_SEARCH_LIMIT = 100;

export const SearchSessionsPayload = obj({
  /** Matched against titles. */
  text: str(),
  projectPaths: arr(str()),
  limit: int({min: 1, max: SESSION_SEARCH_LIMIT}),
  cursor: opt(str()),
});

export const SearchSessionsResult = obj({
  sessions: arr(obj({...SessionSummaryFields, projectPath: str()})),
  nextCursor: union([str(), nul()]),
});

export type SearchSessionsPayload = Static<typeof SearchSessionsPayload>;
export type SearchSessionsResult = Static<typeof SearchSessionsResult>;
