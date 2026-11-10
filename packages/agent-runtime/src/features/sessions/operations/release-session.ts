import type {AgentRuntime} from "@supernova/agent-runtime/composition/runtime";

export async function releaseSession(input: {readonly sessionId: string; readonly projectRoot: string}, runtime: AgentRuntime): Promise<void> {
  const {sessionHosts, checkpointStore, status} = runtime;

  await sessionHosts.release(input.sessionId, {abort: true});
  await checkpointStore.deleteSession({projectRoot: input.projectRoot, sessionId: input.sessionId});
  status.forget(input.sessionId);
}
