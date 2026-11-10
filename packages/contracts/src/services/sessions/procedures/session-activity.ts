import {lit, obj, oneOf, opt, type Static, str, union} from "@earendil-works/chord";
import type {LiveState} from "@supernova/contracts/services/sessions/schemas";

export const SessionSetupStep = oneOf("worktree");

export const SessionActivity = oneOf("idle", "running", "compacting");

export function sessionActivityOf(live: LiveState): SessionActivity {
  if ((live.compactions ?? []).some((compaction) => compaction.blocking || compaction.trigger === "manual")) return "compacting";
  return live.run === undefined ? "idle" : "running";
}

const NoticeFields = {
  level: oneOf("warning", "error"),
  message: str(),
  extensionPath: opt(str()),
  extensionName: opt(str()),
};

export const SessionNotice = obj({...NoticeFields, id: str(), at: str()});

export const SessionReport = union([
  obj({kind: lit("activity"), activity: SessionActivity}),
  obj({kind: lit("sent"), at: str()}),
  obj({kind: lit("notice"), notice: obj(NoticeFields)}),
  obj({kind: lit("title"), title: str()}),
]);

export type SessionReport = Static<typeof SessionReport>;
export type SessionNotice = Static<typeof SessionNotice>;
export type SessionActivity = Static<typeof SessionActivity>;
export type SessionSetupStep = Static<typeof SessionSetupStep>;
