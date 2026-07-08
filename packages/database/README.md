# `@repo/database`

Shared Mongoose MongoDB connection layer for the Atlas monorepo.

Every Atlas API and worker should open MongoDB through this package so
connections, health probes, logging, and shutdown behaviour stay consistent.

## Features

- Process-wide **singleton** connection (`connectDatabase` / `getDatabase`)
- **Automatic reconnect** via the MongoDB Node driver topology monitors
- Readiness **health check** (`ping`) for HTTP / worker probes
- **Graceful shutdown** on `SIGINT` / `SIGTERM` with timeout
- Integrates with `@repo/config` (`MONGODB_URI`) and `@repo/logger`
- Strict TypeScript, JSDoc on every public export
- Unit-test friendly (`registerShutdownHooks: false`, `resetDatabaseForTests`)

## Install

Available to all workspaces automatically:

```json
{
  "dependencies": {
    "@repo/database": "*"
  }
}
```

Build dependencies first so TypeScript consumers resolve declarations:

```sh
npm run build --workspace=@repo/config
npm run build --workspace=@repo/logger
npm run build --workspace=@repo/database
```

## Quick start

```ts
import { loadConfig } from "@repo/config";
import { initLogger, getLogger } from "@repo/logger";
import {
  connectDatabase,
  disconnectDatabase,
  getDatabase,
} from "@repo/database";

const config = loadConfig();

initLogger({
  level: config.logging.level,
  environment: config.nodeEnv === "test" ? "test" : config.env,
  base: { service: "api" },
});

const db = await connectDatabase({
  // uri defaults to config.database.mongodbUri
  // logger defaults to getLogger().child({ component: "database" })
});

getLogger().info({ state: db.getState() }, "database ready");

// In repositories / services — prefer injecting DatabaseClient:
const client = getDatabase();

// Manual teardown (optional — signal hooks call this automatically):
await disconnectDatabase();
```

### Health endpoint

```ts
import { getDatabase } from "@repo/database";

export async function readiness(): Promise<{ ok: boolean }> {
  const status = await getDatabase().healthCheck();
  return { ok: status.healthy };
}
```

Example payload:

```json
{
  "healthy": true,
  "state": "connected",
  "latencyMs": 3,
  "checkedAt": "2026-07-08T09:00:00.000Z"
}
```

## Automatic reconnect

Mongoose 9 / the MongoDB Node driver keep the topology open and reconnect
after transient network failures. This package does **not** call
`mongoose.connect` again on every blip — doing so would race the driver.

Operators see reconnect progress through structured logs:

- `MongoDB disconnected; driver will attempt automatic reconnect`
- `MongoDB reconnected`

Use readiness health checks to withhold traffic while the socket is down.

## Graceful shutdown

By default `connectDatabase` registers `SIGINT` / `SIGTERM` handlers that:

1. Call `disconnectDatabase()`
2. Exit `0` on success, or `1` on failure / timeout (default 10s)

Disable in tests:

```ts
await connectDatabase({
  uri: process.env.MONGODB_URI,
  registerShutdownHooks: false,
});
```

## API

| Export | Purpose |
|---|---|
| `connectDatabase(options?)` | Open / reuse the singleton |
| `getDatabase()` / `getConnection()` | Access the singleton |
| `hasDatabase()` | Whether a client has been established |
| `disconnectDatabase()` | Close sockets and clear the singleton |
| `checkDatabaseHealth(connection)` | Soft health probe |
| `assertDatabaseHealthy(connection)` | Throws when unhealthy |
| `resetDatabaseForTests()` | Clear singleton state in unit tests |
| `DatabaseClient` | Injectable façade for repositories |
| `mongoose` | Same Mongoose instance the package uses |

## Design notes

- **No import-time side effects** — importing the package does not connect.
- **Config + logger injection** — URI and logger resolve from shared packages by default; override in tests.
- **Single connection** — concurrent `connectDatabase` calls share one promise.
- **Credentials redacted** — connection logs never print passwords.
- **Injectable over global** — services should accept `DatabaseClient` via DI;
  reach for `getDatabase()` only at composition roots.

## Scripts

```sh
npm run build --workspace=@repo/database
npm run check-types --workspace=@repo/database
npm run test --workspace=@repo/database
npm run dev --workspace=@repo/database
```
