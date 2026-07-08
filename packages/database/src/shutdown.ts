import type { AtlasLogger } from "@repo/logger";

/**
 * Tracks process signal handlers installed for database graceful shutdown.
 */
export interface ShutdownHookRegistration {
  /**
   * Unregisters the previously installed signal listeners.
   */
  unregister(): void;
}

/**
 * Options controlling graceful shutdown behaviour.
 */
export interface RegisterShutdownHooksOptions {
  /**
   * Signals that should trigger disconnect.
   */
  readonly signals: readonly NodeJS.Signals[];

  /**
   * Invoked when a watched signal is received.
   */
  readonly onSignal: (signal: NodeJS.Signals) => Promise<void>;

  /**
   * Logger used for shutdown diagnostics.
   */
  readonly logger: AtlasLogger;

  /**
   * Maximum time in ms to wait for disconnect before forcing `process.exit(1)`.
   */
  readonly timeoutMs: number;
}

/**
 * Registers process signal handlers that disconnect MongoDB and then exit.
 *
 * Handlers are idempotent per registration set and safe to remove via the
 * returned {@link ShutdownHookRegistration}. Intended for long-running API
 * and worker processes; tests should pass `registerShutdownHooks: false`.
 *
 * @param options - Signals, disconnect callback, logger, and timeout.
 * @returns Handle that removes the installed listeners.
 */
export function registerDatabaseShutdownHooks(
  options: RegisterShutdownHooksOptions,
): ShutdownHookRegistration {
  let shuttingDown = false;

  const handler = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      options.logger.warn(
        { signal },
        "MongoDB shutdown already in progress; ignoring duplicate signal",
      );
      return;
    }

    shuttingDown = true;
    options.logger.info({ signal }, "Received signal; shutting down MongoDB");

    const timeout = setTimeout(() => {
      options.logger.error(
        { signal, timeoutMs: options.timeoutMs },
        "MongoDB graceful shutdown timed out; forcing exit",
      );
      process.exit(1);
    }, options.timeoutMs);

    timeout.unref();

    void options
      .onSignal(signal)
      .then(() => {
        clearTimeout(timeout);
        options.logger.info({ signal }, "MongoDB shutdown complete");
        process.exit(0);
      })
      .catch((error: unknown) => {
        clearTimeout(timeout);
        options.logger.error(
          { err: error, signal },
          "MongoDB shutdown failed",
        );
        process.exit(1);
      });
  };

  for (const signal of options.signals) {
    process.on(signal, handler);
  }

  return {
    unregister(): void {
      for (const signal of options.signals) {
        process.off(signal, handler);
      }
    },
  };
}
