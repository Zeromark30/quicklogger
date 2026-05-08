# Architecture

This document describes how quicklogger is put together. Each section is filled in alongside the code it describes (per the Documentation policy in the spec).

## Overview

(populated in Task 32)

## Server modules

### Units conversion (`src/lib/server/units.ts`)

Pure conversion helpers between US gallons and liters. The constant
`GAL_TO_L = 3.785411784` is the exact definitional ratio (US gallon, NIST).

Public surface:
- `toGallons(value, unit)` — convert to US gallons. `unit` is `'gal'` or `'L'`.
- `toLiters(value, unit)` — convert to liters. Same units.
- `GAL_TO_L` — the conversion constant, exposed for tests.

Negative inputs throw `RangeError`; unknown units throw `TypeError`.
The module has no external dependencies and is safe to import in
both server and edge runtimes.

### Environment configuration (`src/lib/server/env.ts`)

Single source of truth for env-var access. Other server modules import
`loadEnv()` rather than reading `process.env` directly — this keeps
validation centralized and makes the test surface obvious.

Required: `LUBELOGGER_URL`, `LUBELOGGER_API_KEY`. Missing either at
startup throws `EnvError`, which surfaces as a fast-fail container
crash (visible in Discord via LoggiFly).

Optional with defaults: `LUBELOGGER_VOLUME_UNIT` (`gallons_us`),
`LUBELOGGER_CURRENCY` (`USD`), `FX_PROVIDERS`
(`frankfurter,erapi,fawazahmed`), `FX_CACHE_PATH`
(`/data/fx-cache.json`), `PORT` (`3000`), `ORIGIN` (none).

`FX_PROVIDERS` is a CSV; unknown provider names throw `EnvError`.
`EXCHANGERATE_API_KEY` is only required if `exchangerate-api` is in
the chain.

### FX provider chain (`src/lib/server/currency.ts`)

(populated in Task 7)

### LubeLogger client (`src/lib/server/lubelogger.ts`)

(populated in Task 8)

### Conversion orchestrator (`src/lib/server/convert.ts`)

(populated in Task 9)

## Frontend

### State management

(populated in Task 16, Task 17)

### Service worker

(populated in Task 24)

## Data flow

(populated in Task 32)
