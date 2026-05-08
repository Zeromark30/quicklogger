import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadEnv } from '$lib/server/env';
import {
  CurrencyService,
  JsonFileStore,
  realFetcher,
  FxUnavailableError
} from '$lib/server/currency';

let svc: CurrencyService | null = null;

function service() {
  if (svc) return svc;
  const env = loadEnv();
  svc = new CurrencyService({
    providers: env.fxProviders,
    fetcher: realFetcher,
    store: new JsonFileStore(env.fxCachePath)
  });
  return svc;
}

export function _resetForTests() { svc = null; }

export const GET: RequestHandler = async ({ url }) => {
  const from = (url.searchParams.get('from') ?? '').toUpperCase();
  const to = (url.searchParams.get('to') ?? '').toUpperCase();
  if (!from || !to) return json({ error: 'from and to required' }, { status: 400 });

  try {
    const rate = await service().getRate(from, to);
    return json(rate);
  } catch (err) {
    if (err instanceof FxUnavailableError) {
      return json({ available: false }, { status: 503 });
    }
    return json({ error: (err as Error).message }, { status: 500 });
  }
};
