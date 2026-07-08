import { hostname as osHostname } from "node:os";

import pino, {
  type DestinationStream,
  type Logger as PinoLogger,
  type LoggerOptions,
} from "pino";

import { loggerSerializers } from "./serializers.js";
import type {
  AtlasLogger,
  ChildLoggerBindings,
  CreateLoggerOptions,
  LogLevel,
  LoggerEnvironment,
} from "./types.js";

/**
 * Valid Pino log levels used when parsing environment overrides.
 */
const LOG_LEVELS = new Set<LogLevel>([
  "fatal",
  "error",
  "warn",
  "info",
  "debug",
  "trace",
  "silent",
]);

/**
 * Valid environments used when resolving pretty vs JSON formatting.
 */
const ENVIRONMENTS = new Set<LoggerEnvironment>([
  "development",
  "test",
  "staging",
  "production",
]);

/**
 * Narrows an unknown string to a supported {@link LogLevel}.
 *
 * @param value - Candidate level string (typically from `process.env`).
 * @returns The level when recognized; otherwise `undefined`.
 */
export function parseLogLevel(value: string | undefined): LogLevel | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (LOG_LEVELS.has(normalized as LogLevel)) {
    return normalized as LogLevel;
  }

  return undefined;
}

/**
 * Narrows an unknown string to a supported {@link LoggerEnvironment}.
 *
 * @param value - Candidate environment string (typically from `process.env`).
 * @returns The environment when recognized; otherwise `undefined`.
 */
export function parseLoggerEnvironment(
  value: string | undefined,
): LoggerEnvironment | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  if (ENVIRONMENTS.has(normalized as LoggerEnvironment)) {
    return normalized as LoggerEnvironment;
  }

  return undefined;
}

/**
 * Resolves whether pretty (human-readable) transport should be enabled.
 *
 * Pretty mode is intended for local development only. Production and staging
 * always emit newline-delimited JSON so log ships and aggregators can parse lines.
 *
 * @param environment - Resolved runtime environment.
 * @param prettyOverride - Explicit override from {@link CreateLoggerOptions.pretty}.
 * @returns True when `pino-pretty` should wrap the destination.
 */
export function shouldUsePrettyTransport(
  environment: LoggerEnvironment,
  prettyOverride: boolean | undefined,
): boolean {
  if (prettyOverride !== undefined) {
    return prettyOverride;
  }

  return environment === "development";
}

/**
 * Builds Pino logger options shared by root and (indirectly) child loggers.
 *
 * @param options - Caller-supplied create options after defaults are applied.
 * @returns Pino `LoggerOptions` including error serializers and base bindings.
 */
function buildPinoOptions(
  options: Required<
    Pick<CreateLoggerOptions, "level" | "environment">
  > &
    Pick<CreateLoggerOptions, "base" | "requestId" | "name" | "pretty">,
): LoggerOptions {
  /**
   * Preserve Pino’s default process identity fields while merging Atlas bindings.
   * Passing a custom `base` replaces Pino defaults entirely, so pid/hostname
   * must be restored explicitly.
   */
  const base: Record<string, unknown> = {
    pid: process.pid,
    hostname: osHostname(),
    ...(options.base ?? {}),
  };

  if (options.requestId !== undefined) {
    base["requestId"] = options.requestId;
  }

  const pinoOptions: LoggerOptions = {
    level: options.level,
    serializers: { ...loggerSerializers },
    base,
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  if (options.name !== undefined) {
    pinoOptions.name = options.name;
  }

  if (shouldUsePrettyTransport(options.environment, options.pretty)) {
    pinoOptions.transport = {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:standard",
        ignore: "pid,hostname",
        singleLine: false,
      },
    };
  }

  return pinoOptions;
}

/**
 * Wraps a Pino logger in the Atlas {@link AtlasLogger} façade.
 *
 * @param instance - Underlying Pino logger.
 * @returns Documented Atlas logger API.
 */
function wrapPino(instance: PinoLogger): AtlasLogger {
  const logger: AtlasLogger = {
    pino: instance,
    fatal: instance.fatal.bind(instance),
    error: instance.error.bind(instance),
    warn: instance.warn.bind(instance),
    info: instance.info.bind(instance),
    debug: instance.debug.bind(instance),
    trace: instance.trace.bind(instance),
    child(bindings: ChildLoggerBindings): AtlasLogger {
      return wrapPino(instance.child(bindings));
    },
    withRequestId(
      requestId: string,
      bindings: Omit<ChildLoggerBindings, "requestId"> = {},
    ): AtlasLogger {
      return wrapPino(
        instance.child({
          ...bindings,
          requestId,
        }),
      );
    },
    isLevelEnabled(level: LogLevel): boolean {
      return instance.isLevelEnabled(level);
    },
  };

  return logger;
}

/**
 * Creates a new Pino-backed Atlas logger.
 *
 * Prefer {@link initLogger} / {@link getLogger} for process-wide reuse.
 * Use this factory directly when a service needs an isolated logger
 * (for example tests injecting a custom `destination`).
 *
 * @param options - Level, environment, bindings, and destination overrides.
 * @returns A fully configured {@link AtlasLogger}.
 */
export function createLogger(options: CreateLoggerOptions = {}): AtlasLogger {
  const environment =
    options.environment ??
    parseLoggerEnvironment(process.env["NODE_ENV"]) ??
    "development";

  const level =
    options.level ??
    parseLogLevel(process.env["LOG_LEVEL"]) ??
    "info";

  const pinoOptions = buildPinoOptions({
    level,
    environment,
    pretty: options.pretty,
    base: options.base,
    requestId: options.requestId,
    name: options.name,
  });

  const destination: DestinationStream | undefined = options.destination;
  const usePretty = shouldUsePrettyTransport(environment, options.pretty);

  // Pino rejects combining `transport` with a custom destination. Tests that
  // inject a destination therefore always receive JSON (or silent) output.
  if (destination !== undefined) {
    const { transport: _transport, ...optionsWithoutTransport } = pinoOptions;
    void _transport;
    return wrapPino(pino(optionsWithoutTransport, destination));
  }

  if (usePretty) {
    return wrapPino(pino(pinoOptions));
  }

  return wrapPino(pino(pinoOptions));
}
