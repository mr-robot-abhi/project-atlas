# `@repo/logger`

Shared Pino-based structured logging for the Atlas monorepo.

Every Atlas service should log through this package so development, staging,
and production share one format contract: pretty output locally, JSON in
deployed environments, with request correlation and consistent error fields.

## Features

- Process-wide singleton via `initLogger()` / `getLogger()`
- Pretty, colorized logs in development (`pino-pretty`)
- Newline-delimited JSON in production and staging
- Child loggers with structured bindings
- First-class `requestId` support (`withRequestId`)
- Error serialization (`err` / `error` serializers + `serializeError`)
- Strict TypeScript, JSDoc on every public export
- Unit-test friendly (`destination` injection, `silent` level, `resetLogger`)

## Install

Available to all workspaces automatically:

```json
{
  "dependencies": {
    "@repo/logger": "*"
  }
}
```

Build once so TypeScript consumers resolve declarations:

```sh
npm run build --workspace=@repo/logger
```

## Quick start

```ts
import { loadConfig } from "@repo/config";
import { initLogger, getLogger } from "@repo/logger";

const config = loadConfig();

initLogger({
  level: config.logging.level,
  environment: config.nodeEnv === "test" ? "test" : config.env,
  base: { service: "api" },
});

const logger = getLogger();
logger.info("service started");
```

### Request-scoped logging

```ts
import { getLogger } from "@repo/logger";

export function handleRequest(requestId: string): void {
  const log = getLogger().withRequestId(requestId, { route: "/health" });

  try {
    log.info("request started");
    // ...
  } catch (error: unknown) {
    log.error({ err: error }, "request failed");
    throw error;
  }
}
```

Pass errors under the `err` key so Pino’s serializer emits `type`, `message`,
and `stack`. An `error` key is also accepted as an alias.

## Environment behavior

| Environment | Default format | Notes |
|---|---|---|
| `development` | Pretty (colorized) | Override with `pretty: false` |
| `staging` | JSON | Aggregator-friendly NDJSON |
| `production` | JSON | Aggregator-friendly NDJSON |
| `test` | JSON (or silent) | Prefer injected `destination` |

Level defaults to `process.env.LOG_LEVEL` when set, otherwise `info`.
Environment defaults to `process.env.NODE_ENV`, otherwise `development`.

## API

### `initLogger(options?)` / `getLogger(options?)`

Creates and caches the process singleton. `getLogger` lazily initializes with
defaults when `initLogger` was not called.

### `createLogger(options?)`

Factory for an isolated logger (tests, workers with custom bases). Prefer this
over the singleton when injecting a custom `destination`.

### `resetLogger()` / `hasLogger()`

Clears or inspects the singleton — intended for unit tests.

### `AtlasLogger.child` / `withRequestId`

Creates bound child loggers that inherit serializers and parent bindings.

### `serializeError(error)`

Converts unknown thrown values into a JSON-safe structure (including `cause`).

## Unit testing

```ts
import { PassThrough } from "node:stream";
import { createLogger, resetLogger } from "@repo/logger";

const stream = new PassThrough();
const logger = createLogger({
  level: "info",
  environment: "test",
  destination: stream,
});

logger.info({ requestId: "t-1" }, "hello");
// assert on stream output...

// When using the singleton in tests:
resetLogger();
```

Use `level: "silent"` to silence output entirely without a destination.

## Design notes

- **No import-time side effects** — importing the package does not create a logger;
  call `initLogger` or `getLogger` explicitly.
- **Destination and transport are exclusive** — when a custom `destination` is
  provided, pretty transport is skipped so tests receive raw NDJSON.
- **Injectable over global** — services should accept `AtlasLogger` via DI;
  reach for `getLogger()` only at composition roots and middleware.

## Scripts

```sh
npm run build --workspace=@repo/logger
npm run check-types --workspace=@repo/logger
npm run test --workspace=@repo/logger
npm run dev --workspace=@repo/logger
```
