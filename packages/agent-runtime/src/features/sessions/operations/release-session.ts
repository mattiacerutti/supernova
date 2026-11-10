import type {OperationDeps} from "@supernova/agent-runtime/features/sessions/operations/deps";

export async function releaseSession(input: {readonly sessionId: string; readonly projectRoot: string}, deps: OperationDeps): Promise<void> {
  await deps.hosts().release(input.sessionId, {abort: true});
  await deps.checkpoints().deleteSession({projectRoot: input.projectRoot, sessionId: input.sessionId});
  deps.status().forget(input.sessionId);
}
