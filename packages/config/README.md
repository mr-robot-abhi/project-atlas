# `@repo/config`

Shared, Zod-validated environment configuration for the Atlas monorepo.

Every Atlas service and package should load configuration through this package
instead of reading `process.env` directly. Invalid configuration fails fast at
bootstrap so misconfigured deployments never start half-alive.

## Features

- Zod schemas for all environment variables
- Strongly typed `AtlasConfig` object (strict TypeScript, no `any`)
- Fail-fast validation with readable error messages
- Explicit support for `development`, `staging`, and `production`
- Optional dotenv loading for local development
- Cached singleton via `getConfig()` for process-wide reuse

## Install

The package is available to all workspaces automatically:

```json
{
  "dependencies": {
    "@repo/config": "*"
  }
}
```

Build once so TypeScript consumers resolve declarations:

```sh
npm run build --workspace=@repo/config
```

## Quick start

```ts
import { loadConfig, getConfig, ConfigValidationError } from "@repo/config";

try {
  // Validate once at process bootstrap
  const config = loadConfig();

  console.log(config.env); // "development" | "staging" | "production"
  console.log(config.app.port);
  console.log(config.database.mongodbUri);
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

// Later in the same process — returns the cached config
const cached = getConfig();
```

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_ENV` | No | derived from `NODE_ENV` | `development` \| `staging` \| `production` |
| `NODE_ENV` | No | `development` | `development` \| `test` \| `production` |
| `PORT` | No | `3000` | HTTP listen port (`1`–`65535`) |
| `APP_URL` | Yes | — | Public base URL (`http` / `https`) |
| `LOG_LEVEL` | No | `info` | `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `REDIS_URL` | Yes | — | Redis connection URL (`redis://` or `rediss://`) |
| `JWT_SECRET` | Yes | — | JWT signing secret (min 32 chars; min 64 in production) |
| `CORS_ORIGINS` | No | `[]` | Comma-separated browser origins |
| `OPENAI_API_KEY` | No | — | Optional OpenAI key |
| `ANTHROPIC_API_KEY` | No | — | Optional Anthropic key |
| `WORKER_CONCURRENCY` | No | `5` | BullMQ worker concurrency |
| `ENABLE_DEBUG` | No | `false` | Debug instrumentation (`true`/`false`/`1`/`0`) |

### Environment resolution

| `APP_ENV` | `NODE_ENV` | Resolved `config.env` |
|---|---|---|
| set | any | value of `APP_ENV` |
| unset | `production` | `production` |
| unset | `test` | `staging` |
| unset | `development` / unset | `development` |

### Production guardrails

When resolved environment is `production`:

- `APP_URL` must use `https://`
- `ENABLE_DEBUG` must be `false`
- `JWT_SECRET` must be at least 64 characters

## Typed config shape

```ts
interface AtlasConfig {
  env: "development" | "staging" | "production";
  nodeEnv: "development" | "test" | "production";
  isDevelopment: boolean;
  isStaging: boolean;
  isProduction: boolean;
  app: { port: number; url: string; corsOrigins: readonly string[] };
  logging: { level: string; enableDebug: boolean };
  database: { mongodbUri: string };
  redis: { url: string };
  auth: { jwtSecret: string };
  worker: { concurrency: number };
  ai: { openaiApiKey?: string; anthropicApiKey?: string };
}
```

## API

### `loadConfig(options?)`

Validates env vars and returns `AtlasConfig`. Throws `ConfigValidationError` on failure.

```ts
const config = loadConfig({
  loadEnvFile: true,
  envFilePath: ".env.local",
  // Inject a bag for unit tests:
  env: {
    APP_ENV: "development",
    APP_URL: "http://localhost:3000",
    MONGODB_URI: "mongodb://localhost:27017/atlas",
    REDIS_URL: "redis://localhost:6379",
    JWT_SECRET: "dev-secret-which-is-at-least-32-chars",
  },
  cache: true,
});
```

### `getConfig(options?)`

Returns the cached config, or loads + caches on first call.

### `tryLoadConfig(options?)`

Non-throwing variant for tooling / health checks.

### `resetConfigCache()`

Clears the process cache (useful in tests).

### `EnvSchema` / `mapEnvToConfig`

Exported for advanced consumers that want to reuse the schema or mapping logic.

## Local development

Copy the example env file from the monorepo root (or create one per app):

```env
APP_ENV=development
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000
LOG_LEVEL=debug
MONGODB_URI=mongodb://localhost:27017/atlas
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-which-is-at-least-32-chars
CORS_ORIGINS=http://localhost:3000,http://localhost:3001
WORKER_CONCURRENCY=5
ENABLE_DEBUG=true
```

## Design notes

- **Fail fast** — validation errors abort bootstrap; never fall back to unsafe defaults for secrets or connection strings.
- **Single source of truth** — packages and apps share one schema so env contracts stay aligned.
- **No import-time side effects** — importing types / schemas does not touch `process.env`; call `loadConfig()` or `getConfig()` explicitly.
- **Nested domains** — HTTP, DB, Redis, auth, worker, and AI settings are grouped for clean service-layer injection.

## Scripts

```sh
npm run build --workspace=@repo/config
npm run check-types --workspace=@repo/config
npm run dev --workspace=@repo/config
```
