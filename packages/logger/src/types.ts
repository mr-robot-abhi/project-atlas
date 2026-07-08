import type { DestinationStream, Logger as PinoLogger } from "pino";

/**
 * Supported structured log levels, matching Pino and `@repo/config` `LOG_LEVEL`.
 */
export type LogLevel =
  | "fatal"
  | "error"
  | "warn"
  | "info"
  | "debug"
  | "trace"
  | "silent";

/**
 * Runtime environments that influence log formatting.
 *
 * - `development` — human-readable pretty output (when enabled)
 * - `test` — typically silent or destination-injected for assertions
 * - `production` / `staging` — newline-delimited JSON for log aggregators
 */
export type LoggerEnvironment =
  | "development"
  | "test"
  | "staging"
  | "production";

/**
 * Options accepted by {@link createLogger} and {@link initLogger}.
 */
export interface CreateLoggerOptions {
  /**
   * Minimum level that will be emitted.
   * Defaults to `process.env.LOG_LEVEL` when set, otherwise `"info"`.
   */
  readonly level?: LogLevel;

  /**
   * Deployment / process environment used to choose pretty vs JSON transport.
   * Defaults to `process.env.NODE_ENV`, falling back to `"development"`.
   */
  readonly environment?: LoggerEnvironment;

  /**
   * Static bindings attached to every log line from the root logger
   * (for example `{ service: "api" }`).
   */
  readonly base?: Readonly<Record<string, unknown>>;

  /**
   * When true, forces `pino-pretty` regardless of environment.
   * When false, forces JSON output.
   * When omitted, pretty logging is enabled only for `development`.
   */
  readonly pretty?: boolean;

  /**
   * Optional destination stream. Prefer this in unit tests to capture output
   * without writing to stdout (for example `pino.destination({ sync: true })`
   * or a custom writable).
   */
  readonly destination?: DestinationStream;

  /**
   * Optional request / correlation id attached as a top-level `requestId` field
   * on every log from this logger instance.
   */
  readonly requestId?: string;

  /**
   * Overrides the default logger `name` field recorded by Pino.
   */
  readonly name?: string;
}

/**
 * Bindings used when creating a child logger via {@link AtlasLogger.child}.
 */
export interface ChildLoggerBindings {
  /**
   * Propagates or overrides the request / correlation id.
   */
  readonly requestId?: string;

  /**
   * Arbitrary structured context merged into every child log line.
   */
  readonly [key: string]: unknown;
}

/**
 * Atlas logger surface — a thin, documented wrapper around a Pino instance.
 *
 * Prefer injecting this interface (or {@link AtlasLogger}) into services so
 * tests can substitute a silent / destination-backed logger.
 */
export interface AtlasLogger {
  /**
   * Underlying Pino instance for advanced integrations (e.g. HTTP middleware).
   */
  readonly pino: PinoLogger;

  /**
   * Creates a child logger that inherits parent bindings and serializers.
   *
   * @param bindings - Additional structured context for the child.
   * @returns A new {@link AtlasLogger} scoped to the given bindings.
   */
  child(bindings: ChildLoggerBindings): AtlasLogger;

  /**
   * Creates a child logger bound to a request / correlation id.
   *
   * @param requestId - Unique id for the current request or job.
   * @param bindings - Optional extra context merged with `requestId`.
   * @returns A request-scoped {@link AtlasLogger}.
   */
  withRequestId(
    requestId: string,
    bindings?: Omit<ChildLoggerBindings, "requestId">,
  ): AtlasLogger;

  /**
   * Logs at `fatal` level.
   *
   * @param obj - Structured fields and/or an `Error` under the `err` key.
   * @param msg - Human-readable message.
   * @param args - Optional printf-style interpolation values.
   */
  fatal: PinoLogger["fatal"];

  /**
   * Logs at `error` level.
   *
   * @param obj - Structured fields and/or an `Error` under the `err` key.
   * @param msg - Human-readable message.
   * @param args - Optional printf-style interpolation values.
   */
  error: PinoLogger["error"];

  /**
   * Logs at `warn` level.
   *
   * @param obj - Structured fields and/or an `Error` under the `err` key.
   * @param msg - Human-readable message.
   * @param args - Optional printf-style interpolation values.
   */
  warn: PinoLogger["warn"];

  /**
   * Logs at `info` level.
   *
   * @param obj - Structured fields and/or an `Error` under the `err` key.
   * @param msg - Human-readable message.
   * @param args - Optional printf-style interpolation values.
   */
  info: PinoLogger["info"];

  /**
   * Logs at `debug` level.
   *
   * @param obj - Structured fields and/or an `Error` under the `err` key.
   * @param msg - Human-readable message.
   * @param args - Optional printf-style interpolation values.
   */
  debug: PinoLogger["debug"];

  /**
   * Logs at `trace` level.
   *
   * @param obj - Structured fields and/or an `Error` under the `err` key.
   * @param msg - Human-readable message.
   * @param args - Optional printf-style interpolation values.
   */
  trace: PinoLogger["trace"];

  /**
   * Returns whether the given level is enabled for this logger.
   *
   * @param level - Level to inspect.
   * @returns True when messages at that level would be emitted.
   */
  isLevelEnabled(level: LogLevel): boolean;
}
