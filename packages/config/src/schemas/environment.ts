import { z } from "zod";

/**
 * Supported Atlas deployment environments.
 *
 * Keep this closed set explicit so staging-only and production-only
 * guardrails can be expressed as typed constructors rather than string checks.
 */
export const AppEnvironmentSchema = z.enum([
  "development",
  "staging",
  "production",
]);

/**
 * Node-compatible runtime environment flags used by tooling and hosting platforms.
 */
export const NodeEnvironmentSchema = z.enum([
  "development",
  "test",
  "production",
]);

/**
 * Application environment identifier persisted in config.
 */
export type AppEnvironment = z.infer<typeof AppEnvironmentSchema>;

/**
 * Node process environment identifier.
 */
export type NodeEnvironment = z.infer<typeof NodeEnvironmentSchema>;
