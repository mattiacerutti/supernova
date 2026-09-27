/**
 * Fan-out of values to any number of async consumers. Each `subscribe()` call registers immediately and gets its own
 * unbounded queue, so no value published after the call is missed and a slow consumer never blocks anyone else.
 */
export class EventBus<T> {
  private readonly listeners = new Set<(value: T) => void>();

  public publish(value: T): void {
    for (const listener of this.listeners) listener(value);
  }

  /** Values published after this call, until the consumer calls `return()` or stops iterating. */
  public subscribe(): AsyncGenerator<T, void, undefined> {
    const queue: T[] = [];
    let closed = false;
    let wake: (() => void) | undefined;
    const listener = (value: T): void => {
      queue.push(value);
      wake?.();
    };
    this.listeners.add(listener);

    const close = (): void => {
      closed = true;
      this.listeners.delete(listener);
      wake?.();
    };

    const next = async (): Promise<IteratorResult<T, void>> => {
      while (queue.length === 0 && !closed) await new Promise<void>((resolve) => (wake = resolve));
      wake = undefined;
      if (queue.length > 0) return {done: false, value: queue.shift()!};
      return {done: true, value: undefined};
    };

    return {
      next,
      return: async () => {
        close();
        return {done: true, value: undefined};
      },
      throw: async (error) => {
        close();
        throw error;
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  }
}
