import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CurrencyService, type FxFetcher, type FxStore, type FxCacheEntry } from './currency';

function inMemoryStore(initial?: Record<string, FxCacheEntry>): FxStore {
  let data: Record<string, FxCacheEntry> = { ...(initial ?? {}) };
  return {
    async load() { return data; },
    async save(d) { data = { ...d }; }
  };
}

const HOUR = 60 * 60 * 1000;

describe('CurrencyService', () => {
  const now = new Date('2026-05-07T12:00:00Z').getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  it('returns cached rate on hit (< 24h old)', async () => {
    const store = inMemoryStore({
      'USD:CAD': { rate: 1.36, fetchedAt: now - 2 * HOUR, source: 'frankfurter' }
    });
    const fetcher: FxFetcher = vi.fn();
    const svc = new CurrencyService({ providers: ['frankfurter', 'erapi'], fetcher, store });
    const result = await svc.getRate('USD', 'CAD');
    expect(result).toEqual({
      rate: 1.36, source: 'frankfurter', fetchedAt: now - 2 * HOUR, stale: false, ageHours: 2
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('walks the provider chain and stops at first success', async () => {
    const fetcher: FxFetcher = vi.fn(async (provider, _from, _to) => {
      if (provider === 'frankfurter') throw new Error('503');
      if (provider === 'erapi') return { rate: 1.37 };
      throw new Error('should not reach fawazahmed');
    });
    const svc = new CurrencyService({ providers: ['frankfurter', 'erapi', 'fawazahmed'], fetcher, store: inMemoryStore() });
    const result = await svc.getRate('USD', 'CAD');
    expect(result.rate).toBe(1.37);
    expect(result.source).toBe('erapi');
    expect(result.stale).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns stale cache when all providers fail', async () => {
    const cachedAt = now - 10 * HOUR;
    const store = inMemoryStore({ 'USD:CAD': { rate: 1.34, fetchedAt: cachedAt, source: 'frankfurter' } });
    const fetcher: FxFetcher = vi.fn(async () => { throw new Error('down'); });
    const svc = new CurrencyService({ providers: ['frankfurter', 'erapi', 'fawazahmed'], fetcher, store });
    vi.setSystemTime(now + 25 * HOUR);
    const result = await svc.getRate('USD', 'CAD');
    expect(result.rate).toBe(1.34);
    expect(result.stale).toBe(true);
    expect(result.source).toBe('frankfurter');
    expect(result.ageHours).toBeGreaterThan(24);
  });

  it('signals unavailable when all providers fail and no cache', async () => {
    const fetcher: FxFetcher = vi.fn(async () => { throw new Error('down'); });
    const svc = new CurrencyService({ providers: ['frankfurter', 'erapi'], fetcher, store: inMemoryStore() });
    await expect(svc.getRate('USD', 'CAD')).rejects.toMatchObject({ name: 'FxUnavailableError' });
  });

  it('treats cache older than 7 days as unavailable', async () => {
    const eightDays = 8 * 24 * HOUR;
    const store = inMemoryStore({ 'USD:CAD': { rate: 1.30, fetchedAt: now - eightDays, source: 'frankfurter' } });
    const fetcher: FxFetcher = vi.fn(async () => { throw new Error('down'); });
    const svc = new CurrencyService({ providers: ['frankfurter'], fetcher, store });
    await expect(svc.getRate('USD', 'CAD')).rejects.toMatchObject({ name: 'FxUnavailableError' });
  });

  it('passes through identity when from === to', async () => {
    const fetcher: FxFetcher = vi.fn();
    const svc = new CurrencyService({ providers: ['frankfurter'], fetcher, store: inMemoryStore() });
    const result = await svc.getRate('USD', 'USD');
    expect(result.rate).toBe(1);
    expect(result.source).toBe('identity');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('persists fresh fetch to store on success', async () => {
    const store = inMemoryStore();
    const fetcher: FxFetcher = vi.fn(async () => ({ rate: 1.36 }));
    const svc = new CurrencyService({ providers: ['frankfurter'], fetcher, store });
    await svc.getRate('USD', 'CAD');
    const persisted = await store.load();
    expect(persisted['USD:CAD']).toMatchObject({ rate: 1.36, source: 'frankfurter' });
  });
});
