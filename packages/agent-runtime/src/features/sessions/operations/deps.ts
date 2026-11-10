import type {RuntimeNatives, SessionHostsControl} from "@supernova/agent-runtime/core/contract";
import type {Sessions} from "@supernova/agent-runtime/features/sessions/natives/sessions";
import type {SessionStatus} from "@supernova/agent-runtime/features/sessions/natives/session-status";

export interface OperationDeps {
  readonly sessions: () => Sessions;
  readonly status: () => SessionStatus;
  readonly hosts: () => SessionHostsControl;
  readonly checkpoints: () => RuntimeNatives["checkpointStore"];
}
