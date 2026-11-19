import type {Facet} from "@earendil-works/chord";
import type {Context} from "@earendil-works/chord/context";
import {defineFacet} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {ChatService} from "@supernova/contracts/services/chat/services";
import {SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {ChatContextUsage} from "@supernova/contracts/services/chat/schemas";
import {chatDocument, contextKey} from "@supernova/agent-runtime/features/chat/lib/transcript/chat-document";
import {RuntimeConfig, RuntimeNative, SessionInfo} from "@supernova/agent-runtime/core/contract";
import {ChatNative, ChatStore} from "@supernova/agent-runtime/features/chat/contract";
import {Chat} from "@supernova/agent-runtime/features/chat/natives/chat";
import type {Transcript, TranscriptFrame} from "@supernova/agent-runtime/features/chat/natives/transcript";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {nativeOf, serveNative} from "@supernova/agent-runtime/lib/chord/natives";
import {expectVariant, forbidden} from "@supernova/agent-runtime/lib/chord/principals";
import {derivedState} from "@supernova/agent-runtime/lib/chord/state";

interface ContextRead {
  readonly key: string;
  readonly contextUsage: ChatContextUsage;
}

async function readContext(transcript: Transcript, frame: Pick<TranscriptFrame, "state" | "view">, context: Context): Promise<ContextRead> {
  return {key: contextKey(frame), contextUsage: await transcript.contextUsage(frame.state.conversation, frame.view, context)};
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
          },
          context
        ),
      (opened, _reason, context) => opened.close(context)
    );
    self.contribute(ChatNative, chat);

    // Read before the follow attaches, so the first document already holds its context usage.
    const initial = self.open(
      async (context) => readContext(chat.value.transcript, await chat.value.transcript.currentFrame(context), context),
      () => undefined
    );
    const context = self.writable<ContextRead | undefined>(undefined);

    const frame = self.follow((observer, attaching) => chat.value.transcript.follow(observer, attaching));

    const document = derivedState(self, [frame, context], ([value, read]) => {
      const {contextUsage} = read ?? initial.value;
      return chatDocument({record: info.record.value, ...value, contextUsage});
    });

    self.on(frame, async ({value}, ctx) => {
      const {key} = context.value ?? initial.value;
      if (key !== contextKey(value)) context.set(await readContext(chat.value.transcript, value, ctx));
    });

    self.on(frame, async ({value}, ctx) => {
      await chat.value.updateActivity(value, ctx);
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
          sendMessage: method((input, ctx) => chat().sendMessage(input, ctx)),
          forkSeed: method(({turnId}, ctx) => chat().forkSeed(turnId, ctx)),
          seed: method((seed, ctx) => chat().seed(seed, ctx)),
          reload: action(() => chat().reload()),
          abort: action((ctx) => chat().abort(ctx)),
        },
      };
    }

    return {
      variant: "owner",
      members: {
        document: store.document,
        loadHistory: method((input, ctx) => chat().loadHistory(input, ctx)),
        sendMessage: method((input, ctx) => chat().sendMessage(input, ctx)),
        compact: method((input, ctx) => chat().compact(input, ctx)),
        undoCheckpoint: method((input, ctx) => chat().undoCheckpoint(input, ctx)),
        redoCheckpoint: method((input, ctx) => chat().redoCheckpoint(input, ctx)),
        revertToMessage: method((input, ctx) => chat().revertToMessage(input, ctx)),
        abort: action((ctx) => chat().abort(ctx)),
      },
    };
  });
});
