import {local} from "@earendil-works/chord";
import type {SettingsManager} from "@earendil-works/pi-coding-agent";
import {json} from "@supernova/contracts/lib/protocol";
import type {CheckpointStore} from "@supernova/agent-runtime/features/chat/natives/checkpoint-store";
import {nativeRegistry} from "@supernova/agent-runtime/lib/chord/natives";
import type {SessionRecord} from "@supernova/agent-runtime/core/session-state";
import type {SessionExtension} from "@supernova/agent-runtime/features/chat/durable/coding-tools";
import type {ResourceCache} from "@supernova/agent-runtime/pi/resource-cache";
import type {PiSdk} from "@supernova/agent-runtime/pi/sdk";

export interface RuntimePaths {
  readonly sessionsRoot: string;
  readonly worktreesRoot: string;
}

export const RuntimeConfig = local("supernova.runtime-config", {version: 1, params: {}, members: {paths: json<RuntimePaths>()}});

export const SessionInfo = local("supernova.session-info", {version: 1, params: {}, members: {record: json<SessionRecord>()}});

// One per process, shared by every host: one model runtime, and the checkpoint store's project locks hold only shared.
export interface RuntimeNatives {
  readonly sdk: PiSdk;
  readonly resourceCache: ResourceCache;
  readonly checkpointStore: CheckpointStore;
  readonly extensions: readonly SessionExtension[];
  readonly settings: (cwd: string) => SettingsManager;
}

export const RuntimeNative = nativeRegistry<RuntimeNatives>("supernova.native.runtime");

// Composition's: it routes them before any facet loads, as Chord requires.
export interface SessionHostsControl {
  readonly release: (sessionId: string, options: {readonly abort: boolean}) => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly current: (sessionId: string, generation: number) => boolean;
}

export const SessionHostsNative = nativeRegistry<SessionHostsControl>("supernova.native.session-hosts");
