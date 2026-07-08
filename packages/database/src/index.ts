/**
 * `@repo/database` — shared Mongoose MongoDB connection layer for Atlas.
 *
 * Call {@link connectDatabase} once at process bootstrap (after `@repo/config`
 * and `@repo/logger` are initialized), then obtain the singleton via
 * {@link getDatabase} or {@link getConnection}. Prefer injecting
 * {@link DatabaseClient} into repositories so tests can substitute a fake.
 *
 * The package provides:
 * - Process-wide singleton connection with coalesced concurrent connects
 * - Automatic reconnect via the MongoDB Node driver topology monitors
 * - Readiness health checks (`ping`) for HTTP / worker probes
 * - Graceful shutdown on `SIGINT` / `SIGTERM`
 *
 * @packageDocumentation
 */

export {
  connectDatabase,
  disconnectDatabase,
  getConnection,
  getDatabase,
  hasDatabase,
  resetDatabaseForTests,
} from "./connection.js";
export {
  DatabaseConnectionError,
  DatabaseHealthError,
} from "./errors.js";
export {
  assertDatabaseHealthy,
  checkDatabaseHealth,
} from "./health.js";
export {
  registerDatabaseShutdownHooks,
  type RegisterShutdownHooksOptions,
  type ShutdownHookRegistration,
} from "./shutdown.js";
export {
  DEFAULT_DATABASE_OPTIONS,
  type ConnectDatabaseOptions,
  type DatabaseClient,
  type DatabaseConnectionState,
  type DatabaseHealthStatus,
} from "./types.js";
export { mapReadyState, redactMongoUri } from "./utils.js";

/**
 * Re-export the Mongoose default for consumers that define models against the
 * same singleton connection managed by this package.
 */
export { default as mongoose } from "mongoose";
export type { Connection, ConnectOptions, Model, Schema } from "mongoose";
