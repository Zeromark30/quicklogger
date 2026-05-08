interface Entry<T> { value: T; expiresAt: number; }

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  constructor(private readonly ttlMs: number) {}

  async get(key: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > now) return hit.value;
    const value = await fetcher();
    this.entries.set(key, { value, expiresAt: now + this.ttlMs });
    return value;
  }

  invalidate(key: string) { this.entries.delete(key); }
  clear() { this.entries.clear(); }
}
