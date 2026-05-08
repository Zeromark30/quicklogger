# Deployment

## Image build

(populated in Task 26)

## CI workflow

`.github/workflows/ci.yml` runs on every push and pull request:

1. Lint (`npm run lint` — ESLint flat config)
2. Type-check (`npm run check` — svelte-check)
3. Unit + integration tests (`npm test` — Vitest)
4. Build (`npm run build`)
5. E2E (`npm run test:e2e` — Playwright on mobile-Safari profile) — gated; runs only when `tests/e2e/*.spec.ts` files exist (Task 25 introduces them)

Node 22 with npm cache. ~3-minute pipeline. CI must be green for the
release workflow (Task 29) to publish a multi-arch image.

## Release workflow (multi-arch GHCR)

(populated in Task 29)

## Self-hosting (fork-friendly)

(populated in Task 27)

## Homelab-specific stack

(populated in Task 34)
