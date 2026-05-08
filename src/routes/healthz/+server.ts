import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadEnv } from '$lib/server/env';
import { LubeLoggerClient } from '$lib/server/lubelogger';

export const GET: RequestHandler = async () => {
  try {
    const env = loadEnv();
    const client = new LubeLoggerClient({
      baseUrl: env.lubeloggerUrl,
      apiKey: env.lubeloggerApiKey,
      timeoutMs: 2_000
    });
    await client.listVehicles();
    return json({ ok: true });
  } catch (err) {
    return json(
      { ok: false, error: (err as Error).message },
      { status: 503 }
    );
  }
};
