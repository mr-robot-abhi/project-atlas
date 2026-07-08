import { config as loadDotenv } from "dotenv";
import { ZodError } from "zod";

import {
  ConfigValidationError,
  formatConfigError,
} from "./errors.js";
import {
  EnvSchema,
  resolveAppEnvironment,
  type Env,
} from "./schemas/env-schema.js";
import type { AtlasConfig } from "./types.js";

/**
 * Process-local cache populated by {@link loadConfig} / {@link getConfig}.
 */
let cachedConfig: AtlasConfig | undefined;

/**
 * Options controlling how configuration is loaded from the environment.
 */
export interface LoadConfigOptions {
  /**
   * Override process.env for tests or multi-tenant loaders.
   * Defaults to `process.env`.
   */
  readonly env?: NodeJS.ProcessEnv;

  /**
   * When true (default), loads variables from a `.env` file via dotenv
   * before validating. Disable in production when the platform injects env vars.
   */
  readonly loadEnvFile?: boolean;

  /**
   * Optional absolute or relative path to a `.env` file.
   * Only used when `loadEnvFile` is true.
   */
  readonly envFilePath?: string;

  /**
   * When true (default), stores the result for subsequent {@link getConfig} calls.
   */
  readonly cache?: boolean;
}

/**
 * Maps validated environment variables into the nested AtlasConfig shape.
 *
 * @param env - Fully validated environment variable bag.
 * @returns Immutable, strongly typed application configuration.
 */
export function mapEnvToConfig(env: Env): AtlasConfig {
  const appEnv = resolveAppEnvironment(env.APP_ENV, env.NODE_ENV);

  return {
    env: appEnv,
    nodeEnv: env.NODE_ENV,
    isDevelopment: appEnv === "development",
    isStaging: appEnv === "staging",
    isProduction: appEnv === "production",
    app: {
      port: env.PORT,
      url: env.APP_URL,
      corsOrigins: env.CORS_ORIGINS,
    },
    logging: {
      level: env.LOG_LEVEL,
      enableDebug: env.ENABLE_DEBUG,
    },
    database: {
      mongodbUri: env.MONGODB_URI,
    },
    redis: {
      url: env.REDIS_URL,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
    },
    worker: {
      concurrency: env.WORKER_CONCURRENCY,
    },
    ai: {
      openaiApiKey: env.OPENAI_API_KEY,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
    },
  };
}

/**
 * Validates environment variables and returns a typed Atlas configuration.
 *
 * Fails fast: invalid or incomplete configuration throws
 * {@link ConfigValidationError} and must stop service bootstrap.
 *
 * @param options - Optional loader overrides for tests and custom entrypoints.
 * @returns Strongly typed {@link AtlasConfig}.
 * @throws {ConfigValidationError} When validation fails.
 */
export function loadConfig(options: LoadConfigOptions = {}): AtlasConfig {
  const {
    loadEnvFile = true,
    envFilePath,
    env,
    cache = true,
  } = options;

  if (loadEnvFile) {
    loadDotenv(
      envFilePath !== undefined
        ? { path: envFilePath, quiet: true }
        : { quiet: true },
    );
  }

  const source: NodeJS.ProcessEnv = env ?? process.env;

  try {
    const parsed = EnvSchema.parse(source);
    const config = mapEnvToConfig(parsed);

    if (cache) {
      cachedConfig = config;
    }

    return config;
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      throw new ConfigValidationError(formatConfigError(error), error.issues);
    }

    throw error;
  }
}

/**
 * Returns the cached Atlas configuration, loading and validating once if needed.
 *
 * Use this after bootstrap so services share a single validated config object
 * without re-parsing `process.env` on every access.
 *
 * @param options - Optional loader overrides forwarded to {@link loadConfig}
 * when the cache is empty.
 * @returns Strongly typed {@link AtlasConfig}.
 * @throws {ConfigValidationError} When validation fails on first load.
 */
export function getConfig(options?: LoadConfigOptions): AtlasConfig {
  if (cachedConfig !== undefined) {
    return cachedConfig;
  }

  return loadConfig(options);
}

/**
 * Clears the process-local configuration cache.
 *
 * Intended for tests that need to reload configuration with different env vars.
 */
export function resetConfigCache(): void {
  cachedConfig = undefined;
}

/**
 * Soft validation helper for tooling that should report errors without throwing.
 *
 * @param options - Optional loader overrides for tests and custom entrypoints.
 * @returns A success result with config, or a failure result with a typed error.
 */
export function tryLoadConfig(
  options: LoadConfigOptions = {},
):
  | { readonly success: true; readonly config: AtlasConfig }
  | { readonly success: false; readonly error: ConfigValidationError } {
  try {
    return { success: true, config: loadConfig(options) };
  } catch (error: unknown) {
    if (error instanceof ConfigValidationError) {
      return { success: false, error };
    }

    throw error;
  }
}
