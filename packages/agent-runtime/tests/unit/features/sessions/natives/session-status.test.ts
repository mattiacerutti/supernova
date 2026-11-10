import {describe, expect, it} from "vitest";
import type {SessionStatuses} from "@supernova/contracts/services/sessions/services";
import {SessionStatus} from "@supernova/agent-runtime/features/sessions/natives/session-status";

/** A status and every change its listeners heard, as `[sessionId, activity or "gone"]`. */
function observed() {
  const heard: string[] = [];
  let value: SessionStatuses = {sessions: {}};
  const statuses = {
    get value() {
      return value;
    },
    set: (next: SessionStatuses) => {
      for (const sessionId of new Set([...Object.keys(value.sessions), ...Object.keys(next.sessions)])) {
        if (value.sessions[sessionId] !== next.sessions[sessionId]) heard.push(`${sessionId}:${next.sessions[sessionId]?.activity ?? "gone"}`);
      }
      value = next;
    },
  };
  return {heard, status: new SessionStatus(statuses), all: () => value};
}

describe("session status", () => {
  it("holds only live sessions: an idle one with nothing to show leaves the map", () => {
    const {heard, status, all} = observed();
    status.change("a", {kind: "activity", activity: "running"});
    expect(all().sessions).toEqual({a: {activity: "running", setupStep: null, notices: []}});

    status.change("a", {kind: "activity", activity: "idle"});
    expect(all().sessions).toEqual({});
    expect(heard).toEqual(["a:running", "a:gone"]);
  });

  it("tells nothing for a change that changes nothing", () => {
    const {heard, status} = observed();
    status.change("a", {kind: "activity", activity: "idle"});
    status.change("a", {kind: "setup", step: null});
    status.change("a", {kind: "unavailable"});
    status.forget("a");
    expect(heard).toEqual([]);
  });

  it("ends setup when the run starts, and keeps notices when the host stops", () => {
    const {status, all} = observed();
    status.change("a", {kind: "setup", step: "worktree"});
    status.change("a", {kind: "activity", activity: "running"});
    expect(all().sessions.a).toMatchObject({activity: "running", setupStep: null});

    status.change("a", {kind: "notice", notice: {level: "error", message: "Compaction failed."}});
    status.change("a", {kind: "unavailable"});
    expect(all().sessions.a).toMatchObject({activity: "idle", notices: [{level: "error", message: "Compaction failed."}]});
  });

  it("keeps the newest twenty notices", () => {
    const {status, all} = observed();
    for (let index = 1; index <= 25; index++) status.change("a", {kind: "notice", notice: {level: "warning", message: `notice ${index}`}});
    const notices = all().sessions.a!.notices;
    expect(notices).toHaveLength(20);
    expect(notices[0]!.message).toBe("notice 6");
    expect(notices.at(-1)!.message).toBe("notice 25");
  });

  it("forgets an archived session's status, notices included", () => {
    const {heard, status, all} = observed();
    status.change("a", {kind: "notice", notice: {level: "warning", message: "Extension failed to load."}});
    status.forget("a");
    expect(all().sessions).toEqual({});
    expect(heard).toEqual(["a:idle", "a:gone"]);
  });
});
