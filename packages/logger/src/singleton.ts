import { createLogger } from "./create-logger.js";
import type { AtlasLogger, CreateLoggerOptions } from "./types.js";

/**
 * Process-local singleton populated by {@link initLogger} / {@link getLogger}.
 */
let cachedLogger: AtlasLogger | undefined;

/**
 * Initializes (or replaces) the process-wide logger singleton.
 *
 * Call once during application bootstrap after configuration is loaded so
 * the logger picks up the resolved log level and environment.
 *
 * @param options - Create options forwarded to {@link createLogger}.
 * @returns The logger that is now stored as the process singleton.
 */
export function initLogger(options: CreateLoggerOptions = {}): AtlasLogger {
  cachedLogger = createLogger(options);
  return cachedLogger;
}

/**
 * Returns the cached process-wide logger, creating one with defaults if needed.
 *
 * Safe to call from request handlers and workers after bootstrap. For tests,
 * prefer {@link createLogger} with an injected destination, or call
 * {@link resetLogger} between cases.
 *
 * @param options - Used only when the singleton has not been initialized yet.
 * @returns The shared {@link AtlasLogger} instance.
 */
export function getLogger(options?: CreateLoggerOptions): AtlasLogger {
  if (cachedLogger !== undefined) {
    return cachedLogger;
  }

  return initLogger(options);
}

/**
 * Clears the process-local logger singleton.
 *
 * Intended for unit tests that need a fresh logger (different level,
 * destination, or bindings) per case.
 */
export function resetLogger(): void {
  cachedLogger = undefined;
}

/**
 * Returns whether a process-wide logger has already been initialized.
 *
 * @returns True when {@link initLogger} or {@link getLogger} has cached an instance.
 */
export function hasLogger(): boolean {
  return cachedLogger !== undefined;
}
