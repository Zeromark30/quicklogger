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

(populated in Task 6)

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
