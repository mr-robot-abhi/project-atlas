/**
 * `@repo/logger` — shared Pino-based structured logging for Atlas.
 *
 * Initialize once at process bootstrap with {@link initLogger} (after
 * `@repo/config` has resolved `LOG_LEVEL` / environment), then obtain the
 * singleton via {@link getLogger}. Prefer {@link AtlasLogger.withRequestId}
 * or {@link AtlasLogger.child} inside HTTP handlers and workers so every line
 * carries correlation context.
 *
 * Development emits pretty, colorized logs; production and staging emit
 * newline-delimited JSON. Pass a custom `destination` to {@link createLogger}
 * in unit tests to assert on output without touching stdout.
 *
 * @packageDocumentation
 */

export {
  createLogger,
  parseLogLevel,
  parseLoggerEnvironment,
  shouldUsePrettyTransport,
} from "./create-logger.js";
export {
  getLogger,
  hasLogger,
  initLogger,
  resetLogger,
} from "./singleton.js";
export {
  loggerSerializers,
  serializeError,
  type SerializedError,
} from "./serializers.js";
export type {
  AtlasLogger,
  ChildLoggerBindings,
  CreateLoggerOptions,
  LogLevel,
  LoggerEnvironment,
} from "./types.js";
