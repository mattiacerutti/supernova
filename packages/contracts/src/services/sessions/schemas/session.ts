import {bool, obj, opt, type Static, str} from "@earendil-works/chord";
import {SessionWorktree} from "./worktree";

export const SessionSummaryFields = {
  id: str(),
  forked: bool(),
  title: str(),
  updatedAt: str(),
  worktree: opt(SessionWorktree),
  pinned: bool(),
};

export const SessionSummary = obj(SessionSummaryFields);

export type SessionSummary = Static<typeof SessionSummary>;
