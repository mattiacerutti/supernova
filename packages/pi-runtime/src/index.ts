export type PiRuntimeEvent = unknown;

export interface PiRuntimeState {
  cwd: string;
  isReady: boolean;
  isStreaming: boolean;
  sessionFile?: string;
  sessionId?: string;
}

export interface CreatePiRuntimeOptions {
  cwd: string;
}

type EventListener = (event: PiRuntimeEvent) => void;

export class PiRuntime {
  private isReady = false;
  private readonly listeners = new Set<EventListener>();

  constructor(private readonly options: CreatePiRuntimeOptions) {}

  async init(): Promise<PiRuntimeState> {
    this.isReady = true;
    return this.getState();
  }

  onEvent(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async prompt(message: string): Promise<PiRuntimeState> {
    void message;
    this.emit({type: "placeholder", message: "Pi runtime is not wired yet."});
    return this.getState();
  }

  async abort(): Promise<PiRuntimeState> {
    return this.getState();
  }

  getState(): PiRuntimeState {
    return {
      cwd: this.options.cwd,
      isReady: this.isReady,
      isStreaming: false,
    };
  }

  dispose(): void {
    this.isReady = false;
    this.listeners.clear();
  }

  private emit(event: PiRuntimeEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

export function createPiRuntime(options: CreatePiRuntimeOptions): PiRuntime {
  return new PiRuntime(options);
}
