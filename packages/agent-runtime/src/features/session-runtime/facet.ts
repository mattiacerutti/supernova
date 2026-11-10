import type {Facet, Native} from "@earendil-works/chord";
import {defineFacet, defineRegistry, local} from "@earendil-works/chord";
import type {RuntimePrincipal} from "@supernova/contracts/lib/protocol";
import {json} from "@supernova/contracts/lib/protocol";
import {ChatService} from "@supernova/contracts/services/session-runtime/services";
import {SessionStatusService} from "@supernova/contracts/services/sessions/services";
import type {Session} from "@supernova/contracts/services/sessions/schemas";
import {action, method} from "@supernova/agent-runtime/lib/chord/methods";
import {expectVariant, forbidden} from "@supernova/agent-runtime/lib/chord/principals";
import {published} from "@supernova/agent-runtime/lib/chord/state";
import type {ChatDeps} from "@supernova/agent-runtime/features/session-runtime/chat";
import {Chat} from "@supernova/agent-runtime/features/session-runtime/chat";

export const SessionRuntime = local("supernova.session-runtime", {
  version: 2,
  params: {},
  members: {session: json<Session>()},
});

export const ChatNative = defineRegistry<Native<Chat>, Native<Chat> | undefined>("supernova.chat", {version: 1});

export function sessionRuntimeFacet(deps: ChatDeps): Facet<RuntimePrincipal> {
  return defineFacet<RuntimePrincipal>((host) => {
    host.serve(ChatNative, {compose: (table) => table[0]?.value});

    host.serve(SessionRuntime, (_params, self) => {
      const session = published<Session>(self, {} as Session);
      const status = self.get(SessionStatusService, {});
      const chat = self.open(
        (context) =>
          Chat.open(deps, {
            publish: (next) => session.set(next),
            // Async: a reference the host's close ended rejects instead of throwing.
            report: async (report) => {
              await expectVariant(status, "worker").report(report, context);
            },
          }),
        (opened) => opened.close()
      );
      self.contribute(ChatNative, chat);

      return {session: session.member};
    });

    host.serve(ChatService, (_params, principal, self) => {
      if (principal.kind !== "owner" && principal.kind !== "server") throw forbidden("Only the owner may use a session's chat.");

      const runtime = self.get(SessionRuntime, {});
      const native = self.registry(ChatNative);
      const chat = () => {
        const opened = native.value;
        if (!opened) throw new Error("The session is not open.");
        return opened.value;
      };

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
          session: runtime.session,
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
}
