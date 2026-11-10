import type {Facet} from "@earendil-works/chord";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ChatService} from "@supernova/contracts/services/chat/services";
import {SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {AgentState} from "@earendil-works/pi-durable";
import type {ChatContextUsage} from "@supernova/contracts/services/chat/schemas";
import type {BranchEntries} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {appendViewEntries, chatDocument, undoPointKey} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {RuntimeConfig, RuntimeNative, SessionInfo} from "@supernova/agent-runtime/core/contract";
import {ChatNative, ChatStore} from "@supernova/agent-runtime/features/chat/contract";
import {Chat} from "@supernova/agent-runtime/features/chat/natives/chat";
import type {Transcript} from "@supernova/agent-runtime/features/chat/natives/transcript";
import type {SessionState} from "@supernova/agent-runtime/core/session-state";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf, serveNative} from "@supernova/agent-runtime/lib/chord/natives";
import {expectVariant, forbidden} from "@supernova/agent-runtime/lib/chord/principals";
import {derivedState} from "@supernova/agent-runtime/lib/chord/state";

interface UndoPointReads {
  readonly key: string;
  readonly agentState: AgentState | undefined;
  readonly contextUsage: ChatContextUsage;
}

async function readUndoPoint(transcript: Transcript, state: SessionState, branchEntries: BranchEntries): Promise<UndoPointReads> {
  const {branch, leaf} = state;
  const [agentState, contextUsage] = await Promise.all([transcript.agentStateAt(branch, leaf), transcript.contextUsageAt(branch, leaf)]);
  return {key: undoPointKey(state, branchEntries), agentState, contextUsage};
}

export const chatFacet: Facet<RuntimePrincipal> = defineFacet<RuntimePrincipal>((host) => {
  serveNative(host, ChatNative);

  host.serve(ChatStore, (_params, self) => {
    const config = self.get(RuntimeConfig, {});
    const info = self.get(SessionInfo, {});
    const natives = nativeOf(self, RuntimeNative);
    const status = self.get(SessionStatusService, {});

    const chat = self.open(
      (context) =>
        Chat.open(
          {...natives(), record: info.record.value, sessionsRoot: config.paths.value.sessionsRoot},
          {
            // Async: a reference the host's close ended rejects instead of throwing.
            report: async (report) => {
              await expectVariant(status, "worker").report(report, context);
            },
          }
        ),
      (opened) => opened.close()
    );
    self.contribute(ChatNative, chat);

    // Read before the follow attaches, so the first document already holds the branch's entries and the agent.
    const initial = self.open(
      async () => {
        const {transcript} = chat.value;
        const {state, view} = await transcript.currentFrame();
        const branchEntries = await transcript.branchEntries(view);
        return {branchEntries, undoPoint: await readUndoPoint(transcript, state, branchEntries)};
      },
      () => undefined
    );
    const branchEntries = self.writable<BranchEntries | undefined>(undefined);
    const undoPoint = self.writable<UndoPointReads | undefined>(undefined);

    const frame = self.follow((observer, context) => chat.value.transcript.follow(observer, context));

    // A frame whose view continues the cached entries applies at once; one with a gap waits for `branchEntries`.
    const document = derivedState(self, [frame, branchEntries, undoPoint], ([value, cached, read]) => {
      const entries = cached ?? initial.value.branchEntries;
      const {agentState, contextUsage} = read ?? initial.value.undoPoint;
      return chatDocument({
        record: info.record.value,
        view: value.view,
        branchEntries: appendViewEntries(entries, value.view) ?? entries,
        state: value.state,
        agentState,
        contextUsage,
      });
    });

    self.on(frame, async ({value}) => {
      const {transcript} = chat.value;
      const entries = await transcript.branchEntries(value.view);
      branchEntries.set(entries);

      const {key} = undoPoint.value ?? initial.value.undoPoint;
      if (key !== undoPointKey(value.state, entries)) undoPoint.set(await readUndoPoint(transcript, value.state, entries));
    });

    self.on(frame, async ({value}) => {
      await chat.value.updateActivity(value);
    });

    return {document};
  });

  host.serve(ChatService, (_params, principal, self) => {
    if (principal.kind !== "owner" && principal.kind !== "server") throw forbidden("Only the owner may use a session's chat.");

    const store = self.get(ChatStore, {});
    const chat = nativeOf(self, ChatNative);

    if (principal.kind === "server") {
      return {
        variant: "server",
        members: {
          sendMessage: method((input) => chat().sendMessage(input)),
          forkSeed: method(({turnId}) => chat().forkSeed(turnId)),
          seed: method((seed) => chat().seed(seed)),
          reload: action(() => chat().reload()),
          abort: action(() => chat().abort()),
        },
      };
    }

    return {
      variant: "owner",
      members: {
        document: store.document,
        loadHistory: method((input) => chat().loadHistory(input)),
        sendMessage: method((input) => chat().sendMessage(input)),
        compact: method((input) => chat().compact(input)),
        undoCheckpoint: method((input) => chat().undoCheckpoint(input)),
        redoCheckpoint: method((input) => chat().redoCheckpoint(input)),
        revertToMessage: method((input) => chat().revertToMessage(input)),
        abort: action(() => chat().abort()),
      },
    };
  });
});
