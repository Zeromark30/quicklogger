# quicklogger

Mobile-first PWA for logging fuel fillups to a self-hosted [LubeLogger](https://lubelogger.com) instance.

> **Status:** v0.1.0 — early. Single-user homelab tool. Public repo so anyone can fork and self-host.

## Why

LubeLogger's web UI is great for review and analytics, but entering a fillup at the gas pump from a phone is fiddly. quicklogger is a one-form, install-as-PWA front door optimised for the pump.

## Features

- One-screen fuel entry — vehicle picker, odometer, volume, cost, fill-to-full
- Multi-unit input — gallons / liters, USD / CAD / EUR / etc., converted server-side to your LubeLogger's configured units
- Offline queue — submissions saved locally if cell signal drops, auto-synced on reconnect
- iOS Shortcut integration — voice ("Hey Siri, log fillup") and pre-filled deep-links
- FX rate fallback chain — Frankfurter → er-api → fawazahmed currency-api, with disk cache + manual override

## Quickstart

(populated in Task 32)

## Configuration

(populated in Task 32)

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
- [API mapping](docs/api-mapping.md)
- [Apple Shortcuts](docs/shortcuts.md)
- [UAT checklist](docs/uat.md)

## License

MIT — see [LICENSE](LICENSE).
