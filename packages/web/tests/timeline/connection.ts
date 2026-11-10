import type {CreateSessionPayload, SessionActivity} from "@supernova/contracts/services/sessions/procedures";
import type {LiveState, Session, UserMessageContentPart} from "@supernova/contracts/services/sessions/schemas";
import type {ProviderLoginsState} from "@supernova/contracts/services/providers/services";
import type {ListedSession, SessionStatuses, SessionsView} from "@supernova/contracts/services/sessions/services";
import type {TerminalsState} from "@supernova/contracts/services/workspace/services";
import type {Facet} from "@earendil-works/chord";
import {defineFacet, PluginError} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ConfigurationService} from "@supernova/contracts/services/configuration/services";
import {ExtensionsService} from "@supernova/contracts/services/extensions/services";
import {FoldersService} from "@supernova/contracts/services/folders/services";
import {ProvidersService} from "@supernova/contracts/services/providers/services";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import {SessionsService, SessionStatusService} from "@supernova/contracts/services/sessions/services";
import {TerminalService, WorkspaceService} from "@supernova/contracts/services/workspace/services";
import type {RuntimeClient} from "@/runtime/client";
import {Published, testRuntimeClient} from "@tests/support/test-server";
import {assistantEntry, page, runningLive, transcript, userEntry} from "@tests/support/session";
import {createTimelineSessions, timelineModelDetails, timelineStreamContent, TIMELINE_PROJECT_PATH, TIMELINE_SESSION_ID} from "@tests/timeline/data";
import type {TimelineMockState} from "@tests/timeline/test-api";

const STREAM_LINES_PER_FRAME = 2;
const ok = null;

const value = async <T>(result: T): Promise<T> => result;

class TimelineServer {
  private readonly timeline = createTimelineSessions();
  private readonly records = new Map([...this.timeline.values()].map(({record}) => [record.id, record]));
  private readonly sessions = new Map([...this.timeline.values()].map(({session}) => [session.id, session]));
  private readonly documents = new Map<string, Published<Session>>();
  private readonly statuses = new Published<SessionStatuses>({sessions: {}});
  private readonly view = new Published<SessionsView>({projects: {}, open: null});
  private readonly logins = new Published<ProviderLoginsState>({logins: {}});
  private readonly terminals = new Published<TerminalsState>({terminals: {}});
  private openId: string | null = null;
  private activeSessionId = TIMELINE_SESSION_ID;
  private lineCount = 0;
  private reasoningBreaks: number[] = [];
  private status: TimelineMockState["status"] = "idle";
  private streamFrame: number | null = null;
  private streamTargetLineCount = 0;

  public constructor() {
    window.__supernovaTimelineMock = {
      breakForReasoning: () => this.breakForReasoning(),
      completeStream: () => this.settleStream("completed"),
      emitLines: (lineCount) => this.emitLines(lineCount),
      getState: () => {
        const session = this.session(TIMELINE_SESSION_ID);
        const count = (entries: Session["entries"]) => entries.items.filter((entry) => entry.contentParts !== undefined).length;
        return {lineCount: this.lineCount, status: this.status, turnCount: count(session.entries), undoneTurnCount: count(session.undone)};
      },
    };
  }

  public facets(): {readonly server: Facet<RuntimePrincipal>; readonly session: (sessionId: string) => Facet<RuntimePrincipal>} {
    const fail = (code: string, message: string): never => {
      throw new PluginError(code, message);
    };
    // One page holds every timeline session; paging is the server's and covered by its tests.
    const server = defineFacet<RuntimePrincipal>((host) => {
      host.serve(SessionsService, (_params, _principal, self) => ({
        variant: "owner",
        members: {
          view: this.view.member(self),
          showProject: async ({depth, projectPath}) => (this.view.change((draft) => void (draft.projects[projectPath] = this.window(projectPath, depth))), ok),
          hideProject: async ({projectPath}) => (this.view.change((draft) => void delete draft.projects[projectPath]), ok),
          loadMore: () => value(null),
          openSession: async ({sessionId}) => ((this.openId = sessionId), this.refreshView(), ok),
          closeSession: async () => ((this.openId = null), this.refreshView(), ok),
          create: async (payload) => (this.createSession(payload), ok),
          fork: async ({sessionId}) => this.record(sessionId),
          rename: async ({sessionId, title}) => (this.writeRecord({...this.record(sessionId), title}), ok),
          pin: async ({pinned, sessionId}) => (this.writeRecord({...this.record(sessionId), pinned}), ok),
          archive: ({projectPath, sessionId}) => value({projectPath, sessionId}),
          search: async ({text}) => ({sessions: this.matching((session) => session.title.toLowerCase().includes(text.toLowerCase())), nextCursor: null}),
          listComposerSuggestions: () => value({items: []}),
          listModels: () => value([timelineModelDetails]),
        },
      }));
      host.serve(SessionStatusService, (_params, _principal, self) => ({variant: "owner", members: {statuses: this.statuses.member(self)}}));
      host.serve(TerminalService, () => {
        throw new Error("Terminals are not available in timeline tests.");
      });
      host.serve(ConfigurationService, () => ({variant: "owner", members: {get: () => value({modelDefaults: {}})}}));
      host.serve(ExtensionsService, () => ({variant: "owner", members: {update: () => value(null)}}));
      host.serve(FoldersService, () => ({
        variant: "owner",
        members: {
          create: ({path}) => value({path}),
          listFiles: ({query}) => value({items: [], query}),
          listSuggestions: ({query}) => value({homePath: TIMELINE_PROJECT_PATH, query, queryPath: query || TIMELINE_PROJECT_PATH, queryPathType: "directory", suggestions: []}),
        },
      }));
      host.serve(ProvidersService, (_params, _principal, self) => ({
        variant: "owner",
        members: {
          logins: this.logins.member(self),
          cancelLogin: async () => fail("ProviderLoginError", "No login."),
          list: () => value([]),
          logout: ({providerId}) => value({providerId}),
          startLogin: async () => fail("ProviderLoginError", "No login."),
          submitLoginInput: async () => fail("ProviderLoginError", "No login."),
        },
      }));
      host.serve(WorkspaceService, (_params, _principal, self) => ({
        variant: "owner",
        members: {
          terminals: this.terminals.member(self),
          closeTerminal: () => value(null),
          openTerminal: async () => fail("TerminalError", "Terminals are not available in timeline tests."),
          getChanges: () => value({uncommitted: []}),
          getDiffContents: () => value({newContents: "", oldContents: ""}),
          listBranches: async () => fail("WorkspaceNotARepositoryError", "Not a repository."),
          listFiles: () => value({files: []}),
          listRepositories: () => value({repositories: []}),
          readFile: () => value({content: ""}),
        },
      }));
    });
    // As on the server, a chat is one session's, and holding an unknown one fails.
    const session = (sessionId: string) =>
      defineFacet<RuntimePrincipal>((host) => {
        host.serve(ChatService, (_params, _principal, self) => {
          if (!this.sessions.has(sessionId)) throw new Error("Session not found.");
          return {
            variant: "owner",
            members: {
              session: this.document(sessionId).member(self),
              abort: async () => (this.settleStream("aborted"), ok),
              compact: async () => ok,
              // Timeline sessions are one page; paging is the server's and covered by its tests.
              loadHistory: async () => page([]),
              redoCheckpoint: async () => (this.redoCheckpoint(sessionId), ok),
              revertToMessage: async ({turnId}) => (this.revertToMessage(sessionId, turnId), ok),
              sendMessage: async ({contentParts}) => (this.startStream(sessionId, contentParts), ok),
              undoCheckpoint: async () => (this.undoCheckpoint(sessionId), ok),
            },
          };
        });
      });
    return {server, session};
  }

  private document(sessionId: string): Published<Session> {
    let document = this.documents.get(sessionId);
    if (!document) {
      document = new Published(this.session(sessionId));
      this.documents.set(sessionId, document);
    }
    return document;
  }

  private record(sessionId: string): ListedSession {
    const record = this.records.get(sessionId);
    if (!record) throw new Error(`Unknown timeline test session: ${sessionId}`);
    return record;
  }

  private writeRecord(record: ListedSession): void {
    this.records.set(record.id, record);
    this.refreshView();
  }

  private refreshView(): void {
    this.view.change((draft) => {
      for (const [projectPath, window] of Object.entries(draft.projects)) draft.projects[projectPath] = this.window(projectPath, window.depth);
      draft.open = (this.openId === null ? null : (this.records.get(this.openId) ?? null)) as typeof draft.open;
    });
  }

  private session(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Unknown timeline test session: ${sessionId}`);
    return session;
  }

  private createSession({id, message, projectPath}: CreateSessionPayload): Session {
    const updatedAt = new Date().toISOString();
    this.writeRecord({id, title: "Untitled session", forked: false, pinned: false, projectPath, updatedAt});
    const session: Session = {
      id,
      updatedAt,
      entries: page([]),
      undone: page([]),
      agent: {},
      live: {},
      usage: {models: {}, tools: {}},
      context: {usedTokens: 0, contextWindow: 0},
    };
    this.sessions.set(session.id, session);
    if (message) this.startStream(session.id, message.contentParts);
    return this.session(session.id);
  }

  private commit(session: Session, activity: SessionActivity): void {
    this.sessions.set(session.id, session);
    this.document(session.id).set(session);
    this.statuses.change((draft) => {
      if (activity === "idle") delete draft.sessions[session.id];
      else draft.sessions[session.id] = {activity, notices: [], setupStep: null};
    });
    this.refreshView();
  }

  private matching(include: (record: ListedSession) => boolean): ListedSession[] {
    // A session's activity is its conversation's, as the catalog's `touch` keeps it.
    return [...this.records.values()]
      .filter(include)
      .map((record) => ({...record, updatedAt: this.sessions.get(record.id)?.updatedAt ?? record.updatedAt}))
      .toSorted((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt.localeCompare(left.updatedAt));
  }

  private window(projectPath: string, depth: number) {
    return {depth, loading: false, items: this.matching((session) => session.projectPath === projectPath), hasMore: false};
  }

  private turnStarts(entries: Session["entries"]["items"]): number[] {
    return entries.flatMap((entry, index) => (entry.contentParts === undefined ? [] : [index]));
  }

  private showTurns(sessionId: string, count: number): void {
    const session = this.session(sessionId);
    const all = [...session.entries.items, ...session.undone.items];
    const starts = this.turnStarts(all);
    const cut = starts[count] ?? all.length;
    this.commit(
      {
        ...session,
        entries: page(all.slice(0, cut)),
        undone: page(all.slice(cut), cut < all.length ? (all[cut - 1]?.id ?? null) : null),
        updatedAt: new Date().toISOString(),
      },
      "idle"
    );
  }

  private visibleTurnCount(session: Session): number {
    return this.turnStarts(session.entries.items).length;
  }

  private undoCheckpoint(sessionId: string): void {
    const count = this.visibleTurnCount(this.session(sessionId));
    if (count > 0) this.showTurns(sessionId, count - 1);
  }

  private redoCheckpoint(sessionId: string): void {
    const session = this.session(sessionId);
    if (this.turnStarts(session.undone.items).length > 0) this.showTurns(sessionId, this.visibleTurnCount(session) + 1);
  }

  private revertToMessage(sessionId: string, turnId: string): void {
    const session = this.session(sessionId);
    const ids = [...session.entries.items, ...session.undone.items].filter((entry) => entry.contentParts !== undefined).map((entry) => String(entry.id));
    const index = ids.indexOf(turnId);
    if (index < 0) return;
    const visible = this.visibleTurnCount(session);
    this.showTurns(sessionId, index < visible ? index : index + 1);
  }

  private startStream(sessionId: string, contentParts: readonly UserMessageContentPart[]): void {
    if (this.status === "streaming") return;

    this.activeSessionId = sessionId;
    this.lineCount = 0;
    this.reasoningBreaks = [];
    this.streamTargetLineCount = 0;
    this.status = "streaming";
    const session = this.session(sessionId);
    const userId = this.nextEntryId(session);
    this.commit(
      {
        ...session,
        entries: page([...session.entries.items, ...transcript([userEntry({parts: contentParts})], {firstId: userId})]),
        undone: page([]),
        runStart: userId,
        live: this.streamLive(),
      },
      "running"
    );
  }

  private nextEntryId(session: Session): number {
    return Math.max(0, ...[...session.entries.items, ...session.undone.items].map((entry) => entry.id)) + 1;
  }

  private breakForReasoning(): void {
    if (this.status !== "streaming" || this.reasoningBreaks.includes(this.lineCount)) return;

    this.reasoningBreaks.push(this.lineCount);
  }

  private streamLive(): LiveState {
    return runningLive({partial: timelineStreamContent({lineCount: this.lineCount, reasoningBreaks: this.reasoningBreaks})});
  }

  private emitLines(additionalLineCount: number): void {
    if (this.status !== "streaming" || additionalLineCount <= 0) return;

    this.streamTargetLineCount += additionalLineCount;
    if (this.streamFrame !== null) return;

    const tick = (): void => {
      if (this.status !== "streaming") return;

      this.lineCount = Math.min(this.lineCount + STREAM_LINES_PER_FRAME, this.streamTargetLineCount);
      this.commit({...this.session(this.activeSessionId), live: this.streamLive()}, "running");

      if (this.lineCount < this.streamTargetLineCount) {
        this.streamFrame = window.requestAnimationFrame(tick);
        return;
      }

      this.streamFrame = null;
    };

    this.streamFrame = window.requestAnimationFrame(tick);
  }

  private stopPump(): void {
    if (this.streamFrame !== null) window.cancelAnimationFrame(this.streamFrame);
    this.streamFrame = null;
    this.streamTargetLineCount = this.lineCount;
  }

  private settleStream(status: "aborted" | "completed"): void {
    if (this.status !== "streaming") return;

    this.stopPump();
    this.status = status;
    const previous = this.session(this.activeSessionId);
    const answer = assistantEntry(timelineStreamContent({lineCount: Math.max(this.lineCount, 1), reasoningBreaks: this.reasoningBreaks}));
    const next = {
      ...previous,
      entries: page([...previous.entries.items, ...transcript([answer], {firstId: this.nextEntryId(previous)})]),
      live: {},
      updatedAt: new Date().toISOString(),
    };
    delete next.runStart;
    this.commit(next, "idle");
  }
}

let sharedClient: RuntimeClient | undefined;

export function getRuntimeClient(): RuntimeClient {
  if (!sharedClient) {
    const timeline = new TimelineServer();
    sharedClient = testRuntimeClient(timeline.facets()).client;
  }
  return sharedClient;
}
