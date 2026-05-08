# API mapping

## LubeLogger upstream calls

The server module `src/lib/server/lubelogger.ts` is the only place
quicklogger talks to LubeLogger. All requests carry `x-api-key:
${LUBELOGGER_API_KEY}`. Base URL is `${LUBELOGGER_URL}` (typically
`http://lubelog:8080` on the homelab br0 network).

| quicklogger method | LubeLogger endpoint | Notes |
|---|---|---|
| `listVehicles()` | `GET /api/vehicles` | Returns array of `Vehicle` |
| `listGasRecords(vehicleId)` | `GET /api/vehicle/gasrecords?vehicleId=N` | Returns array of `GasRecord` |
| `addGasRecord(vehicleId, payload)` | `POST /api/vehicle/gasrecords/add?vehicleId=N` | Body is `multipart/form-data` |

`addGasRecord` form-data fields (LubeLogger schema, all stringly-typed):
- `date` — `MM/DD/YYYY`
- `odometer` — integer as string
- `fuelconsumed` — decimal as string, in LubeLogger's configured unit (gallons_us by default)
- `isfilltofull` — `'true'` | `'false'`
- `missedfuelup` — `'true'` | `'false'`
- `cost` — decimal as string, in LubeLogger's configured currency
- `notes` — optional
- `tags` — optional

Errors: any non-2xx response throws `LubeLoggerError` with `status` and
`body` properties. The error name is `'LubeLoggerError'` so route
handlers can `instanceof`-check.

Timeout: 5 seconds per request (configurable). Abort signal cancels
the underlying fetch.

## quicklogger endpoints

### `GET /healthz`

Liveness + LubeLogger reachability probe.

- 200 `{ ok: true }` if process is up and LubeLogger responded to
  `/api/vehicles` within 2 seconds.
- 503 `{ ok: false, error: string }` otherwise.

Used by Traefik for routing decisions and by Dockhand for container
health tracking. No auth required (LAN-trust model).

### `GET /api/vehicles`

Returns the LubeLogger vehicle list verbatim, JSON array.

- Cached in-memory for 5 minutes (per-process, no Redis). Reduces
  upstream chatter when the form mounts repeatedly.
- 502 if LubeLogger is unreachable or returns non-2xx — the service
  worker treats this as queue-eligible if the call is part of a
  submission flow.
- No params. No request body. No auth (LAN-trust).
