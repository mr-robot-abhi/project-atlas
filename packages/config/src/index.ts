/**
 * `@repo/config` — shared, Zod-validated environment configuration for Atlas.
 *
 * Call {@link loadConfig} or {@link getConfig} at process bootstrap so invalid
 * environment variables fail fast before the application serves traffic.
 * Prefer the nested {@link AtlasConfig} object over reading `process.env`
 * anywhere else in the monorepo.
 *
 * @packageDocumentation
 */

export {
  ConfigValidationError,
  formatConfigError,
} from "./errors.js";
export {
  getConfig,
  loadConfig,
  mapEnvToConfig,
  resetConfigCache,
  tryLoadConfig,
  type LoadConfigOptions,
} from "./load-config.js";
export {
  EnvSchema,
  resolveAppEnvironment,
  type Env,
} from "./schemas/env-schema.js";
export {
  AppEnvironmentSchema,
  NodeEnvironmentSchema,
  type AppEnvironment,
  type NodeEnvironment,
} from "./schemas/environment.js";
export type { AtlasConfig } from "./types.js";
