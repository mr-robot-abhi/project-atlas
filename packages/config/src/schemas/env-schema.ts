import { z } from "zod";

import {
  AppEnvironmentSchema,
  NodeEnvironmentSchema,
} from "./environment.js";

/**
 * Coerces a string boolean representation into a real boolean.
 *
 * Accepts `"true" | "false" | "1" | "0"` (case-insensitive) and rejects
 * everything else so misconfigured feature flags fail at startup.
 */
const booleanFromEnv = z.preprocess((value: unknown): unknown => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "true" || normalized === "1") {
    return true;
  }

  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return value;
}, z.boolean());

/**
 * Parses a port string into an integer within the valid TCP range.
 */
const portFromEnv = z.coerce
  .number()
  .int()
  .min(1, "PORT must be >= 1")
  .max(65535, "PORT must be <= 65535");

/**
 * Parses a comma-separated list into a trimmed string array.
 * Empty tokens are discarded.
 */
const csvStringArray = z.preprocess((value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return value;
  }

  if (value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}, z.array(z.string().min(1)));

/**
 * Raw environment variable schema for Atlas services.
 *
 * Validation is intentionally strict: missing or malformed values fail fast
 * before any application bootstrap continues.
 */
export const EnvSchema = z
  .object({
    /**
     * Deployment environment for Atlas application configuration.
     * Prefer APP_ENV when present; falls back to NODE_ENV mapping.
     */
    APP_ENV: AppEnvironmentSchema.optional(),

    /**
     * Standard Node process environment used by hosts and tooling.
     */
    NODE_ENV: NodeEnvironmentSchema.default("development"),

    /**
     * HTTP server listen port.
     */
    PORT: portFromEnv.default(3000),

    /**
     * Public-facing application / API base URL.
     * Hostname is intentionally unrestricted so local development
     * (`http://localhost:3000`) and private networking remain valid.
     */
    APP_URL: z.url({
      protocol: /^https?$/,
    }),

    /**
     * Structured logging verbosity for the shared logger package.
     */
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    /**
     * MongoDB connection string used by `@repo/database`.
     */
    MONGODB_URI: z
      .string()
      .min(1, "MONGODB_URI is required")
      .refine(
        (value) =>
          value.startsWith("mongodb://") ||
          value.startsWith("mongodb+srv://"),
        "MONGODB_URI must start with mongodb:// or mongodb+srv://",
      ),

    /**
     * Redis connection URL used by queues, cache, and pub/sub.
     */
    REDIS_URL: z
      .string()
      .min(1, "REDIS_URL is required")
      .refine(
        (value) =>
          value.startsWith("redis://") || value.startsWith("rediss://"),
        "REDIS_URL must start with redis:// or rediss://",
      ),

    /**
     * Symmetric secret used to sign and verify JWTs.
     * Must be long enough to resist brute-force attacks.
     */
    JWT_SECRET: z
      .string()
      .min(32, "JWT_SECRET must be at least 32 characters"),

    /**
     * Allowed CORS origins (comma-separated in environment variables).
     */
    CORS_ORIGINS: csvStringArray.default([]),

    /**
     * Optional OpenAI API key for model invocations.
     * Required only when AI provider integrations are enabled.
     */
    OPENAI_API_KEY: z.string().min(1).optional(),

    /**
     * Optional Anthropic API key for model invocations.
     */
    ANTHROPIC_API_KEY: z.string().min(1).optional(),

    /**
     * BullMQ / scheduler concurrency for worker processes.
     */
    WORKER_CONCURRENCY: z.coerce
      .number()
      .int()
      .positive()
      .default(5),

    /**
     * Enables verbose debug instrumentation outside production.
     */
    ENABLE_DEBUG: booleanFromEnv.default(false),
  })
  .superRefine((env, ctx) => {
    const resolvedAppEnv = resolveAppEnvironment(env.APP_ENV, env.NODE_ENV);

    if (resolvedAppEnv === "production") {
      if (!env.APP_URL.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          path: ["APP_URL"],
          message: "APP_URL must use HTTPS in production",
        });
      }

      if (env.ENABLE_DEBUG) {
        ctx.addIssue({
          code: "custom",
          path: ["ENABLE_DEBUG"],
          message: "ENABLE_DEBUG must be false in production",
        });
      }

      if (env.JWT_SECRET.length < 64) {
        ctx.addIssue({
          code: "custom",
          path: ["JWT_SECRET"],
          message: "JWT_SECRET must be at least 64 characters in production",
        });
      }
    }
  });

/**
 * Maps optional APP_ENV / NODE_ENV into a single Atlas AppEnvironment.
 *
 * @param appEnv - Explicit Atlas environment when provided.
 * @param nodeEnv - Node process environment fallback.
 * @returns Resolved Atlas application environment.
 */
export function resolveAppEnvironment(
  appEnv: z.infer<typeof AppEnvironmentSchema> | undefined,
  nodeEnv: z.infer<typeof NodeEnvironmentSchema>,
): z.infer<typeof AppEnvironmentSchema> {
  if (appEnv !== undefined) {
    return appEnv;
  }

  if (nodeEnv === "production") {
    return "production";
  }

  if (nodeEnv === "test") {
    return "staging";
  }

  return "development";
}

/**
 * Inferred shape of validated raw environment variables.
 */
export type Env = z.infer<typeof EnvSchema>;
