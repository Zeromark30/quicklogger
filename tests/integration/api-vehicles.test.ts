import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { GET, _resetCache } from '../../src/routes/api/vehicles/+server';

const upstream = setupServer();
beforeAll(() => upstream.listen({ onUnhandledRequest: 'error' }));
afterEach(() => upstream.resetHandlers());
afterAll(() => upstream.close());

beforeAll(() => {
  process.env.LUBELOGGER_URL = 'http://lubelog:8080';
  process.env.LUBELOGGER_API_KEY = 'k';
});

beforeEach(() => _resetCache());

describe('GET /api/vehicles', () => {
  it('proxies to lubelogger and returns the vehicle array', async () => {
    upstream.use(
      http.get('http://lubelog:8080/api/vehicles', () =>
        HttpResponse.json([{ id: 1, year: 2019, make: 'Honda', model: 'Civic Si' }])
      )
    );
    const res = await GET({} as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe(1);
  });

  it('caches subsequent calls within 5 minutes', async () => {
    let calls = 0;
    upstream.use(
      http.get('http://lubelog:8080/api/vehicles', () => {
        calls++;
        return HttpResponse.json([{ id: 1 }]);
      })
    );
    await GET({} as Parameters<typeof GET>[0]);
    await GET({} as Parameters<typeof GET>[0]);
    await GET({} as Parameters<typeof GET>[0]);
    expect(calls).toBe(1);
  });

  it('returns 502 when LubeLogger 5xx', async () => {
    upstream.use(
      http.get('http://lubelog:8080/api/vehicles', () => new HttpResponse(null, { status: 503 }))
    );
    const res = await GET({} as Parameters<typeof GET>[0]);
    expect(res.status).toBe(502);
  });
});
