/**
 * Serializes async work per key while allowing different keys to run concurrently.
 *
 * Locks are in-process and scoped to one instance. Keys are removed once no work
 * is queued for them, so long-lived instances do not accumulate entries.
 */
export class KeyedMutex<Key> {
  private readonly queues = new Map<Key, Promise<void>>();

  /** Runs `work` once all previously queued work for `key` has settled. */
  public withLock<A>(key: Key, work: () => Promise<A>): Promise<A> {
    const pending = this.queues.get(key) ?? Promise.resolve();
    const result = pending.then(work);
    const settled = result.then(
      () => undefined,
      () => undefined
    );

    this.queues.set(key, settled);
    void settled.then(() => {
      if (this.queues.get(key) === settled) this.queues.delete(key);
    });

    return result;
  }
}
