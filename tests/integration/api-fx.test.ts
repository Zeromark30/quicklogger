import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { GET, _resetForTests } from '../../src/routes/api/fx/+server';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

const upstream = setupServer();
beforeAll(() => upstream.listen({ onUnhandledRequest: 'error' }));
afterEach(() => upstream.resetHandlers());
afterAll(() => upstream.close());

const tmpCache = join(tmpdir(), `fx-cache-${process.pid}.json`);

beforeAll(() => {
  process.env.LUBELOGGER_URL = 'http://lubelog:8080';
  process.env.LUBELOGGER_API_KEY = 'k';
  process.env.FX_CACHE_PATH = tmpCache;
  process.env.FX_PROVIDERS = 'frankfurter,erapi,fawazahmed';
});

beforeEach(async () => {
  await rm(tmpCache, { force: true });
  _resetForTests();
});

function urlFor(from: string, to: string) {
  return new URL(`http://localhost/api/fx?from=${from}&to=${to}`);
}

describe('GET /api/fx', () => {
  it('returns rate=1 for identity', async () => {
    const res = await GET({ url: urlFor('USD', 'USD') } as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.rate).toBe(1);
    expect(body.source).toBe('identity');
  });

  it('walks chain — provider 1 fails, provider 2 succeeds', async () => {
    upstream.use(
      http.get('https://api.frankfurter.dev/v1/latest', () => new HttpResponse(null, { status: 503 })),
      http.get('https://open.er-api.com/v6/latest/:from', () => HttpResponse.json({ rates: { CAD: 1.37 } }))
    );
    const res = await GET({ url: urlFor('USD', 'CAD') } as Parameters<typeof GET>[0]);
    const body = await res.json();
    expect(body.rate).toBe(1.37);
    expect(body.source).toBe('erapi');
    expect(body.stale).toBe(false);
  });

  it('returns 503 with available=false when chain is dry and no cache', async () => {
    upstream.use(
      http.get('https://api.frankfurter.dev/v1/latest', () => new HttpResponse(null, { status: 503 })),
      http.get('https://open.er-api.com/v6/latest/:from', () => new HttpResponse(null, { status: 503 })),
      http.get('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/:base', () =>
        new HttpResponse(null, { status: 503 })
      )
    );
    const res = await GET({ url: urlFor('USD', 'CAD') } as Parameters<typeof GET>[0]);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.available).toBe(false);
  });
});
