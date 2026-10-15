export class KeyedMutex<Key> {
  private readonly queues = new Map<Key, Promise<void>>();

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
