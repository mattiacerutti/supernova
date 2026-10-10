import type {AttachedReplicatedState, Context, JsonValue, ReplicatedStateSourceAttachment, ReplicatedStateSourceFrame} from "@earendil-works/chord";
import {replicatedState} from "@earendil-works/chord";
import {diffRevisions} from "@earendil-works/chord/delta";

/**
 * Chord replicated state whose revisions are whole documents built elsewhere. Each published document is diffed
 * against the previous one into one frame, so subscribers receive only what changed, as with the engine's own view
 * state. Documents must be strict JSON (no undefined fields) and are not mutated after publishing.
 */
export class DocumentState<T extends object> {
  public readonly state: AttachedReplicatedState<T>;
  private current: T;
  private cursor = 0;
  private listener: ((frame: ReplicatedStateSourceFrame<T>) => void) | undefined;
  private readonly buffered: ReplicatedStateSourceFrame<T>[] = [];

  public constructor(initial: T, onError?: (error: Error) => void) {
    this.current = initial;
    this.state = replicatedState<T>({attach: () => this.attach()}, onError ? {onError} : undefined);
  }

  public get value(): T {
    return this.current;
  }

  /** Publishes `next` as the new revision; returns false when nothing changed. */
  public publish(next: T, context: Context): boolean {
    const ops = diffRevisions(this.current as unknown as JsonValue, next as unknown as JsonValue);
    if (ops.length === 0) return false;
    this.current = next;
    this.cursor += 1;
    const frame = {cursor: this.cursor, value: next, ops, context};
    if (this.listener) this.listener(frame);
    else this.buffered.push(frame);
    return true;
  }

  public dispose(): void {
    this.state.dispose();
  }

  private attach(): ReplicatedStateSourceAttachment<T> {
    return {
      snapshot: {value: this.current, cursor: this.cursor},
      activate: (listener) => {
        this.listener = listener;
        for (const frame of this.buffered.splice(0)) listener(frame);
      },
      dispose: () => {
        this.listener = undefined;
      },
    };
  }
}
