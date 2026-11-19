import type {SessionSetupStep} from "@supernova/contracts/services/sessions/procedures";
import type {UserMessageContentPart} from "@supernova/contracts/services/chat/schemas";
import type {ListedSession} from "@supernova/contracts/services/sessions/services";
import {create} from "zustand";

export interface PendingMessage {
  readonly id: string;
  readonly contentParts: readonly UserMessageContentPart[];
  readonly timestamp: string;
}

// What the user did that the runtime does not show yet.
export interface SessionOptimism {
  // The record of a session this client is creating, until the catalog has it.
  readonly created?: ListedSession;
  readonly message?: PendingMessage;
  readonly navigation?: {readonly lastTurnId: string | null};
  readonly stopping?: boolean;
  readonly compacting?: boolean;
  readonly title?: string;
  readonly pinned?: boolean;
  readonly archived?: boolean;
  readonly setupStep?: SessionSetupStep;
  readonly error?: string;
}

interface SessionOptimismStoreState {
  readonly optimism: Readonly<Record<string, SessionOptimism>>;
  readonly patchOptimism: (sessionId: string, change: SessionOptimism) => void;
  readonly forgetOptimism: (sessionId: string) => void;
}

export const useSessionOptimismStore = create<SessionOptimismStoreState>()((set) => ({
  optimism: {},
  patchOptimism: (sessionId, change) => set((state) => ({optimism: {...state.optimism, [sessionId]: {...state.optimism[sessionId], ...change}}})),
  forgetOptimism: (sessionId) => set((state) => ({optimism: Object.fromEntries(Object.entries(state.optimism).filter(([id]) => id !== sessionId))})),
}));
