import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { POST, _resetForTests } from '../../src/routes/api/fuelup/+server';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm } from 'node:fs/promises';

const upstream = setupServer();
beforeAll(() => upstream.listen({ onUnhandledRequest: 'error' }));
afterEach(() => upstream.resetHandlers());
afterAll(() => upstream.close());

const tmpCache = join(tmpdir(), `fuelup-fx-${process.pid}.json`);

beforeAll(() => {
  process.env.LUBELOGGER_URL = 'http://lubelog:8080';
  process.env.LUBELOGGER_API_KEY = 'k';
  process.env.FX_CACHE_PATH = tmpCache;
  process.env.FX_PROVIDERS = 'frankfurter';
});

beforeEach(async () => {
  await rm(tmpCache, { force: true });
  _resetForTests();
});

function makeRequest(body: unknown, contentType = 'application/json') {
  return new Request('http://localhost/api/fuelup', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body: contentType === 'application/json' ? JSON.stringify(body) : body as BodyInit
  });
}

const baseInput = {
  vehicleId: 1,
  date: '2026-05-07',
  odometer: 87432,
  volume: 50,
  volumeUnit: 'L',
  cost: 65,
  currency: 'CAD',
  isFillToFull: true,
  missedFuelup: false,
  clientSubmissionId: '00000000-0000-0000-0000-000000000001'
};

describe('POST /api/fuelup', () => {
  it('happy path — converts CAD/L → USD/gal and posts to lubelogger', async () => {
    let observedForm: FormData | null = null;
    upstream.use(
      http.get('https://api.frankfurter.dev/v1/latest', () => HttpResponse.json({ rates: { USD: 0.73 } })),
      http.post('http://lubelog:8080/api/vehicle/gasrecords/add', async ({ request }) => {
        observedForm = await request.formData();
        return HttpResponse.json({ success: true });
      })
    );

    const req = makeRequest(baseInput);
    const res = await POST({ request: req } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.submitted.gallons).toBeCloseTo(13.21, 2);
    expect(body.submitted.cost).toBeCloseTo(47.45, 2);

    expect(observedForm?.get('date')).toBe('05/07/2026');
    expect(observedForm?.get('odometer')).toBe('87432');
    expect(Number(observedForm?.get('fuelconsumed') as string)).toBeCloseTo(13.21, 2);
    expect(observedForm?.get('isfilltofull')).toBe('true');
    expect(observedForm?.get('missedfuelup')).toBe('false');
  });

  it('accepts form-urlencoded body in addition to JSON', async () => {
    upstream.use(
      http.get('https://api.frankfurter.dev/v1/latest', () => HttpResponse.json({ rates: { USD: 1 } })),
      http.post('http://lubelog:8080/api/vehicle/gasrecords/add', () => HttpResponse.json({ success: true }))
    );
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...baseInput, currency: 'USD', volumeUnit: 'gal' })) {
      usp.set(k, String(v));
    }
    const res = await POST({ request: makeRequest(usp.toString(), 'application/x-www-form-urlencoded') } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
  });

  it('returns 502 on lubelogger 5xx and does not retry', async () => {
    upstream.use(
      http.get('https://api.frankfurter.dev/v1/latest', () => HttpResponse.json({ rates: { USD: 0.73 } })),
      http.post('http://lubelog:8080/api/vehicle/gasrecords/add', () => new HttpResponse('upstream down', { status: 503 }))
    );
    const res = await POST({ request: makeRequest(baseInput) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(502);
  });

  it('idempotent within 60s on duplicate clientSubmissionId', async () => {
    let upstreamCalls = 0;
    upstream.use(
      http.get('https://api.frankfurter.dev/v1/latest', () => HttpResponse.json({ rates: { USD: 0.73 } })),
      http.post('http://lubelog:8080/api/vehicle/gasrecords/add', () => {
        upstreamCalls++;
        return HttpResponse.json({ success: true });
      })
    );
    await POST({ request: makeRequest(baseInput) } as Parameters<typeof POST>[0]);
    const dup = await POST({ request: makeRequest(baseInput) } as Parameters<typeof POST>[0]);
    expect(dup.status).toBe(200);
    expect(upstreamCalls).toBe(1);
  });

  it('returns 400 on missing required fields', async () => {
    const incomplete = { ...baseInput, vehicleId: undefined };
    const res = await POST({ request: makeRequest(incomplete) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it('uses manualFxRate when provided (no chain call)', async () => {
    upstream.use(
      http.post('http://lubelog:8080/api/vehicle/gasrecords/add', () => HttpResponse.json({ success: true }))
    );
    const res = await POST({ request: makeRequest({ ...baseInput, manualFxRate: 0.72 }) } as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submitted.fxRate).toBe(0.72);
    expect(body.submitted.fxSource).toBe('manual');
  });
});
