import type { AppEnvironment, NodeEnvironment } from "./schemas/environment.js";

/**
 * Strongly typed Atlas runtime configuration shared across the monorepo.
 *
 * Nested by concern so consumers depend only on the slice they need
 * (HTTP, database, queue, AI providers) without reaching into process.env.
 */
export interface AtlasConfig {
  /**
   * Resolved Atlas deployment environment.
   */
  readonly env: AppEnvironment;

  /**
   * Underlying Node process environment.
   */
  readonly nodeEnv: NodeEnvironment;

  /**
   * True when running in the development environment.
   */
  readonly isDevelopment: boolean;

  /**
   * True when running in the staging environment.
   */
  readonly isStaging: boolean;

  /**
   * True when running in the production environment.
   */
  readonly isProduction: boolean;

  /**
   * HTTP / public application settings.
   */
  readonly app: {
    /**
     * HTTP listen port for API and worker HTTP health endpoints.
     */
    readonly port: number;

    /**
     * Canonical public base URL for the service.
     */
    readonly url: string;

    /**
     * Allowed CORS origins for browser clients.
     */
    readonly corsOrigins: readonly string[];
  };

  /**
   * Observability / logging settings.
   */
  readonly logging: {
    /**
     * Minimum log level forwarded to `@repo/logger`.
     */
    readonly level:
      | "fatal"
      | "error"
      | "warn"
      | "info"
      | "debug"
      | "trace"
      | "silent";

    /**
     * When true, enables verbose instrumentation intended for non-production.
     */
    readonly enableDebug: boolean;
  };

  /**
   * Persistence connections.
   */
  readonly database: {
    /**
     * MongoDB connection URI.
     */
    readonly mongodbUri: string;
  };

  /**
   * Cache / queue broker connections.
   */
  readonly redis: {
    /**
     * Redis connection URL.
     */
    readonly url: string;
  };

  /**
   * Authentication / authorization secrets.
   */
  readonly auth: {
    /**
     * Symmetric JWT signing secret.
     */
    readonly jwtSecret: string;
  };

  /**
   * Background worker / scheduler settings.
   */
  readonly worker: {
    /**
     * Maximum concurrent BullMQ jobs for a worker process.
     */
    readonly concurrency: number;
  };

  /**
   * Optional LLM provider credentials.
   * Keys are undefined when the matching provider is not configured.
   */
  readonly ai: {
    /**
     * OpenAI API key when configured.
     */
    readonly openaiApiKey: string | undefined;

    /**
     * Anthropic API key when configured.
     */
    readonly anthropicApiKey: string | undefined;
  };
}
