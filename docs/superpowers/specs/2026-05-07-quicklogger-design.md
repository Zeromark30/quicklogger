# quicklogger — design spec

**Status:** approved (brainstorming complete)
**Author:** Varun Panchal (vp@simplementix.com)
**Date:** 2026-05-07
**Initial version:** v0.1.0
**Repo:** `varunpan/quicklogger` (public, MIT)
**Stack on homelab:** `/home/varun/stacks/quicklogger/`

## Goal

A mobile-first PWA for logging fuel fillups to a self-hosted LubeLogger
instance directly from the gas pump. Replaces the friction of LubeLogger's
own UI on a phone. Single-user (Varun), private homelab deployment, but the
repo is public so anyone can fork and point it at their own LubeLogger.

## Non-goals

- Multi-user accounts, roles, sharing
- Editing or deleting historical fillups (use LubeLogger's UI for that)
- Maintenance / service / repair record entry — fuel only
- Public hosted SaaS — runs on the user's own infrastructure only

## Core requirements

1. Submit a fuel record to LubeLogger with one form, mobile-optimized
2. Accept volume in gallons or liters, cost in any major currency
3. Convert volume → US gallons and cost → USD before posting (i.e., to
   whatever LubeLogger's configured units are; defaults to gallons_us / USD)
4. Reach LubeLogger over the internal Docker network — no public traffic
   for the API call
5. Survive flaky cell signal at the pump: queue submissions when offline,
   auto-retry when back online
6. Deploy via GitHub Actions to GHCR; homelab pulls manually (matches
   existing Dockhand "auto-update OFF" discipline)

## Architecture

```
                        Developer push to main
                                │
                                ▼
                   ┌──────────────────────────┐
                   │  GitHub Actions (CI)     │
                   │  ─ lint, type-check      │
                   │  ─ svelte-check + tests  │
                   │  ─ buildx multi-arch     │
                   │    (linux/amd64+arm64)   │
                   │  ─ push to GHCR          │
                   └──────────────────────────┘
                                │
                                ▼
                  ghcr.io/varunpan/quicklogger
                  tags: latest, vX.Y.Z, sha-<short>
                                │
                                ▼ (Dockhand notifies; manual pull)
                   docker compose pull && up -d
                                │
                                ▼
┌───────────────────────────────────────────────────────────┐
│  Homelab (br0 docker network)                             │
│                                                           │
│  Phone (PWA over Tailscale or LAN)                        │
│        │                                                  │
│        ▼  HTTPS, Vault PKI cert (resolver=vault)          │
│  Traefik  ──► quicklog.home.lab                           │
│        │                                                  │
│        ▼                                                  │
│  ┌──────────────────────────┐                             │
│  │ quicklogger container    │                             │
│  │ ─ SvelteKit (Node 22)    │                             │
│  │ ─ Server routes proxy    │──► http://lubelog:8080      │
│  │   to LubeLogger API      │     (internal br0)          │
│  │ ─ Static + service worker│                             │
│  │ ─ In-mem FX cache (24h)  │──► api.frankfurter.dev      │
│  └──────────────────────────┘                             │
└───────────────────────────────────────────────────────────┘
```

**Multi-arch build:** GitHub Actions uses `docker/build-push-action` with
`platforms: linux/amd64,linux/arm64`, producing a single multi-arch
manifest per tag. The Mac (arm64 dev) and homelab (amd64 prod) pull the
right variant automatically. Local dev uses `docker compose up` which
builds natively on whatever platform the developer is on; multi-arch is
only required in CI.

**Auth model:** None at the app layer. LAN-trust via Traefik on
`*.home.lab`. Phone reaches the host via Tailscale or local LAN.
LubeLogger API key lives only in the container as `LUBELOGGER_API_KEY`,
never exposed to the phone.

**Cert situation:** `quicklog.home.lab` uses the homelab Vault PKI
intermediate CA. The iPhone already has the root CA profile installed
(2026-05-07), so certs are trusted natively without warnings.

## Components

### Frontend (SvelteKit pages)
- `/` — main fuel entry form (mobile-first, mockup B variant)
- `/vehicles` — bottom-sheet picker (auto-skipped if vehicle count = 1)
- `/history` — last 10 fillups for active vehicle, read-only
- `/settings` — preferred volume unit, currency, retry aggressiveness

### Frontend state
- `localStorage` — `lastVehicleId`, `defaultVolumeUnit`, `defaultCurrency`
- `IndexedDB` (via `idb`) — `pendingSubmissions` queue
- Service worker `Cache Storage` — app shell (instant launch)

### Service worker
- Pre-caches app shell on install
- Network-first for `/api/*`, with IndexedDB-queue fallback on POST
  failures
- `sync` event re-tries queued submissions; iOS fallback is "on app
  focus" check since Background Sync is not universally supported

### Backend (SvelteKit server routes)
- `GET /api/vehicles` — proxy to `lubelog:8080/api/vehicles`, 5-min cache
- `GET /api/vehicle/last-fuelup?vehicleId=` — fetch latest gas record
  for the MPG-since-last preview line
- `POST /api/fuelup` — accept user payload, convert, post to LubeLogger,
  return what was actually submitted (gallons, USD, fxRate, fxDate)
- `GET /api/fx?from=USD&to=CAD` — return cached Frankfurter rate
- `GET /healthz` — 200 if process up + LubeLogger reachable in <2s

### Server modules (`src/lib/server/`)
- `lubelogger.ts` — typed client (vehicles, list-gasrecords,
  add-gasrecord)
- `units.ts` — pure conversions (US gal ↔ L: 3.785411784)
- `currency.ts` — multi-provider FX client with fallback chain (see
  "FX provider chain" below), 24h cache persisted to disk, stale-rate
  fallback, 7-day staleness cutoff, manual-override support
- `convert.ts` — orchestrates: takes (volume, volumeUnit, cost,
  currency) → (gallons, USD) using current FX rate

### Configuration (env vars)
| Var | Example | Purpose |
|---|---|---|
| `LUBELOGGER_URL` | `http://lubelog:8080` | Internal LubeLogger URL |
| `LUBELOGGER_API_KEY` | (32-hex) | Editor-scope API key |
| `LUBELOGGER_VOLUME_UNIT` | `gallons_us` | Target unit on LubeLogger side |
| `LUBELOGGER_CURRENCY` | `USD` | Target currency on LubeLogger side |
| `FX_PROVIDERS` | `frankfurter,erapi,fawazahmed` | Provider chain order (CSV). All free, no key required |
| `EXCHANGERATE_API_KEY` | (optional) | If set, prepends exchangerate-api.com to chain |
| `FX_CACHE_PATH` | `/data/fx-cache.json` | Persistent cache file (mounted volume) |
| `PORT` | `3000` | App port |
| `ORIGIN` | `https://quicklog.home.lab` | SvelteKit CSRF origin |

### Repo artifacts
- `Dockerfile` — multi-stage, Node 22-alpine, ~80 MB final image
- `compose.example.yml` — fork-friendly drop-in
- `.github/workflows/ci.yml` — lint + typecheck + tests on every push/PR
- `.github/workflows/build.yml` — multi-arch build + push to GHCR on
  main and version tags
- `docs/architecture.md`, `docs/deployment.md`, `docs/api-mapping.md`, `docs/uat.md`, `docs/shortcuts.md`
- `shortcuts/quicklog-fuelup.shortcut`, `shortcuts/quicklog-prefill.shortcut` — pre-built iOS Shortcut files
- `README.md` — what it is, screenshots, quickstart, env vars
- `LICENSE` — MIT
- `.gitignore`, `.dockerignore`

### Stack on homelab (`/home/varun/stacks/quicklogger/`)
- `docker-compose.yml` — pulls pinned GHCR tag (e.g. `:0.1.0`, **not**
  `:latest`), joins `br0`, declares Traefik labels for
  `quicklog.home.lab` with `tls.certresolver=vault`, mounts
  `./data:/data` for the persistent FX cache
- `.env` — secrets (never committed)
- `data/` — persistent FX cache JSON (created on first run, gitignored
  in the stack repo if you version-control it)

## Data flow

### Happy path — fuel submission
1. Phone opens PWA. Service worker serves cached shell instantly.
2. `GET /api/vehicles` → backend hits `lubelog:8080`, caches, returns list.
3. Form auto-selects `lastVehicleId`; user can change.
4. `GET /api/vehicle/last-fuelup` → returns `{ odometer, date }` for
   the live "MPG since last fill" preview.
5. User enters volume + unit, cost + currency, fill-to-full toggle.
6. If `currency != LUBELOGGER_CURRENCY`, form calls `GET /api/fx` to
   render the inline preview (e.g. "= $36.51 USD").
7. User taps "Log fillup" → `POST /api/fuelup` with raw user input.
8. Backend converts → posts form-data to
   `lubelog:8080/api/vehicle/gasrecords/add?vehicleId=X` with
   `x-api-key`. Returns `{ ok: true, submitted: {...} }`.
9. Phone shows success toast with submitted values.

### Offline path — submission while signal is dead
1. Phone tries `POST /api/fuelup`, fetch fails or returns 5xx.
2. Service worker writes payload to IndexedDB `pendingSubmissions`
   with `status=queued, attempts=0, clientSubmissionId=<UUID>`.
3. UI shows "Saved locally — will sync".
4. When network returns, `sync` event (or app-focus fallback) re-tries
   each queued submission. Exponential backoff, capped at 5 attempts.
5. On 4xx (validation), mark `failed` and surface in `/history` with
   edit option — don't retry forever on permanent errors.

### FX rate refresh (with provider fallback chain)
- On first `/api/fx?from=X&to=Y` call after process start, the backend
  consults the persistent disk cache at `FX_CACHE_PATH`. If a fresh
  entry exists (<24h), return it.
- If cache is stale or missing, walk the provider chain in order. Each
  provider has a 3s timeout. The first one that responds with a valid
  rate becomes the canonical rate; cache is updated on disk + in memory.
- If all providers in the chain fail:
  1. Return last-known cached rate (if any) with `stale: true` and
     `staleness: <hours>` — the UI shows a "FX rate is N hours old" hint
     but still allows submit.
  2. If no cache exists at all (cold start + total outage), return
     `available: false` — the UI then shows a **manual override field**
     letting the user enter the FX rate themselves (e.g., from the pump
     display). Submitted rate is recorded with `source: manual` for
     traceability.
- After 7 days stale: treat as unavailable, force manual-override path.

## Error handling

| Failure | Where caught | User experience |
|---|---|---|
| LubeLogger 401 | backend | "Server config error — check API key", logged to stderr, not retried |
| LubeLogger 4xx (bad payload) | backend | Field-specific error mapped, marked failed in queue, visible in `/history` |
| LubeLogger 5xx / timeout | backend | 502 to frontend → service worker queues for retry |
| One FX provider unreachable | backend | Silently skipped, next in chain tried |
| All FX providers unreachable, cache valid | backend | Stale cache returned with `stale: true` and `staleness: <hours>` |
| All FX providers unreachable, no cache | backend | UI prompts for manual rate entry, submit still proceeds with `source: manual` |
| FX older than 7 days | backend | Treated as unavailable, force manual-override path |
| Network failure on phone | service worker | Queue + "Saved locally — will sync" toast |
| Odometer < last reading | frontend | Inline warning, doesn't block |
| LubeLogger container down | backend | 502 → queue. Dockhand+LoggiFly already alert via Discord |
| Phone localStorage cleared | frontend | First open shows vehicle picker, no data loss |
| Double-submit | backend | Idempotent on `clientSubmissionId` UUID, 60s window |
| SW broken | n/a | App still works as plain web page, queue degrades to "submit failed" |

**Logging:** structured JSON to stdout. LoggiFly already monitors
container logs and forwards errors to Discord — no extra wiring needed.

**Health:** `/healthz` returns 200 if process up + LubeLogger reachable
in <2s.

## Testing

### Unit (Vitest)
- `units.test.ts` — round-trip gal↔L at known values, zero, very large,
  reject negatives
- `currency.test.ts` — TTL hit/miss, provider chain (1st succeeds → others skipped; 1st fails → 2nd tried; all fail → stale cache; all fail + no cache → unavailable signal); disk persistence (write on success, read on cold start); 7-day cutoff
- `convert.test.ts` — full conversion (50 L / 65 CAD / fx 0.73 →
  13.21 gal / 47.45 USD), idempotent if already in target units
- `lubelogger.test.ts` — request shape matches Postman collection,
  `x-api-key` header set, correct query params

### Integration (Vitest + msw)
- `/api/fuelup` flow with LubeLogger mocked — happy, 4xx, 5xx, timeout
- `/api/vehicles` cache behavior (second call within 5min doesn't hit
  upstream)
- `/api/fx` provider-chain fallback (mocked: provider 1 503, provider 2
  503, provider 3 200 → returns provider 3's rate; all 503 + cache
  present → stale; all 503 + no cache → `available: false`)
- `POST /api/fuelup` with `?vehicleId=...&volume=...` query params on
  `/` (Apple Shortcut deep-link path) → form pre-fills correctly
- `POST /api/fuelup` accepting JSON body (Shortcut direct-POST path) in
  addition to form-data — both content-types must work

### E2E (Playwright, one critical path)
- Open `/` → vehicle auto-selected → fill (50 L / 65 CAD /
  fill-to-full) → submit → success toast shows "11.2 gal / $36.51 USD"

### Manual UAT (`docs/uat.md`)
- Install PWA on iPhone, submit a real fillup at the pump
- Toggle airplane mode mid-submit, verify queue + sync on reconnect
- Verify LubeLogger record matches form input post-conversion
- Install both `.shortcut` files on iPhone, run "Hey Siri, log
  fillup" voice flow end-to-end
- Run prefill shortcut from home screen → verify form opens with
  correct pre-filled values
- Block outbound 443 on the homelab firewall briefly, submit a CAD
  fillup → verify manual FX entry surfaces and submission still works
- Confirm Vault PKI cert loads cleanly (root CA already installed
  on iPhone as of 2026-05-07)

### CI workflows
- `ci.yml` — every push/PR: eslint, svelte-check, Vitest, build
  verification
- `build.yml` — push to main + version tags: runs `ci.yml` first, then
  multi-arch buildx → push to GHCR with tags `latest`, `vX.Y.Z`,
  `sha-<short>`

## FX provider chain

All providers are free and require no signup unless noted. The chain is
configurable via `FX_PROVIDERS` env var (CSV). Default order:

| Order | Provider | Endpoint | Notes |
|---|---|---|---|
| 1 | `frankfurter` | `api.frankfurter.dev/v1/latest` | ECB rates (daily), no key, no rate limit |
| 2 | `erapi` | `open.er-api.com/v6/latest/USD` | Free, no key, ~1500 req/month soft limit |
| 3 | `fawazahmed` | `cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json` | CDN-cached JSON on jsDelivr, no key, no rate limit |
| optional | `exchangerate-api` | `v6.exchangerate-api.com/v6/<KEY>/latest/USD` | Only enabled if `EXCHANGERATE_API_KEY` is set; prepended to chain |

Each provider has a 3-second timeout. The first successful response
wins. Failures are logged but don't block the chain. The disk cache
(`FX_CACHE_PATH`, default `/data/fx-cache.json`) survives container
restarts so a homelab reboot during an outage doesn't wipe known rates.

**No-internet handling:** If outbound traffic is blocked (homelab WAN
down) and no provider in the chain responds, the cached rate (if any)
is used with `stale: true`. If no cache exists, the UI prompts for
manual entry of the FX rate. The submission still goes through;
LubeLogger receives the converted USD value and the manual rate is
recorded in the response payload for the user's reference.

## Apple Shortcuts (iOS)

`v0.1.0` ships with two integration paths:

### Path 1 — URL-scheme deep link (form pre-fill)
The home page (`/`) accepts query params:
```
https://quicklog.home.lab/?vehicleId=1&volume=11.2&volumeUnit=gal&cost=42.18&currency=USD&fillToFull=true
```
The form mounts pre-filled with these values; the user just taps
"Log fillup" to submit. Useful for: tap-shortcut-from-home-screen
flows where the user types/dictates values into Shortcuts prompts and
the form acts as the visual confirmation.

### Path 2 — Direct POST (voice-friendly, no UI)
Shortcuts uses "Get Contents of URL" with method=POST and
content-type=application/json against `/api/fuelup`. No web UI shown;
returns success/failure to Shortcuts, suitable for "Hey Siri, log
fillup" voice flows. Same payload schema as the web form.

### Repo deliverables
- `shortcuts/quicklog-fuelup.shortcut` — pre-built iOS Shortcut file,
  downloadable, opens in Shortcuts app on tap. Provides voice-driven
  prompts for vehicle / volume / cost; submits via Path 2.
- `shortcuts/quicklog-prefill.shortcut` — alternative Shortcut that
  uses Path 1 (opens the web form pre-filled).
- `docs/shortcuts.md` — install instructions, customization guide,
  payload spec for users who want to build their own.

Android Shortcuts (Tasker / Macrodroid integration) is parked for a
later release; the same `/api/fuelup` endpoint will serve any client.

## Versioning

SemVer. Initial release `v0.1.0` (functional MVP, may break). Path:
- `0.x.y` — daily-driving phase, breaking changes allowed
- `1.0.0` — stable after enough real-world fillups without surprises

GHCR tags mirror Git tags. Compose pins exact version, never `:latest`,
matching the homelab's "explicit, manual updates" discipline.

## Documentation policy (binding constraint on implementation)

**Documentation is written in the same task as the code it documents,
never deferred to a "docs phase" at the end.** This applies to every
parallel agent / sub-task during implementation:

- A task that creates `src/lib/server/currency.ts` must also update
  `docs/architecture.md` (or the relevant doc) with the FX-chain
  behavior in the same commit, before the task is marked complete.
- A task that creates `.github/workflows/build.yml` must also update
  `docs/deployment.md` with the multi-arch buildx flow in the same
  commit.
- A task that creates `/api/fuelup` must update `docs/api-mapping.md`
  with the request/response schema in the same commit.
- A task that creates the `shortcuts/` files must produce
  `docs/shortcuts.md` describing the install steps in the same commit.

**Why:** documentation written months after the fact rots fast; written
alongside the code, it's accurate and the author still remembers
edge-case rationale. Also: if someone forks this repo, the docs are
always coherent with the code at any tag.

**How writing-plans should encode this:** every task that ships
shippable code (server module, route, CI workflow, deploy artifact,
shortcut file) lists its associated documentation update as part of
the task, not as a downstream task. Reviewers should reject any task
that ships code without the matching doc update.

The only exception is the top-level `README.md` — it's authored as a
single late task once all subsystems exist, since it summarizes them
all.

## Out of scope (parking lot)

These are not in v0.1.0 but may make sense later:
- Photo of pump receipt with OCR for odometer/cost auto-fill
- Service / repair entries (LubeLogger has more record types)
- Android Shortcuts integration (Tasker / Macrodroid templates)
- Multi-LubeLogger support (point at different instances)
- Charts / cost-per-mile trend view
- Push notifications when a sync completes after a long offline window
