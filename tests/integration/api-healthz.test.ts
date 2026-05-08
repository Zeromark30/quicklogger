import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { GET } from '../../src/routes/healthz/+server';

const upstream = setupServer();
beforeAll(() => upstream.listen({ onUnhandledRequest: 'error' }));
afterEach(() => upstream.resetHandlers());
afterAll(() => upstream.close());

beforeAll(() => {
  process.env.LUBELOGGER_URL = 'http://lubelog:8080';
  process.env.LUBELOGGER_API_KEY = 'k';
});

describe('GET /healthz', () => {
  it('returns 200 when LubeLogger is reachable', async () => {
    upstream.use(
      http.get('http://lubelog:8080/api/vehicles', () => HttpResponse.json([]))
    );
    const res = await GET({} as Parameters<typeof GET>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns 503 when LubeLogger is unreachable', async () => {
    upstream.use(
      http.get('http://lubelog:8080/api/vehicles', () =>
        new HttpResponse(null, { status: 503 })
      )
    );
    const res = await GET({} as Parameters<typeof GET>[0]);
    expect(res.status).toBe(503);
  });
});
