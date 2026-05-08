import type {AgentSessionStreamEvent, IAgentModelReference} from "@pi-desktop/contracts/sessions";
import {useMutation} from "@tanstack/react-query";
import {Effect, Stream} from "effect";
import {AgentRpcProtocolClientService, eq} from "@/rpc/effect-query";

interface ISendSessionMessageMutationInput {
  message: string;
  model: IAgentModelReference;
  onEvent: (event: AgentSessionStreamEvent) => void;
  sessionId: string;
}

export function useSendSessionMessage() {
  return useMutation(
    eq.mutationOptions({
      mutationFn: (input: ISendSessionMessageMutationInput) =>
        Effect.gen(function* () {
          const rpc = yield* AgentRpcProtocolClientService;
          yield* rpc
            .sendSessionMessage({message: input.message, model: input.model, sessionId: input.sessionId})
            .pipe(Stream.runForEach((event) => Effect.sync(() => input.onEvent(event))));
        }),
    })
  );
}
