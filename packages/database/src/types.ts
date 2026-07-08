import type { AtlasLogger } from "@repo/logger";
import type { ConnectOptions, Connection } from "mongoose";

/**
 * Human-readable connection lifecycle states mirrored from Mongoose
 * {@link import("mongoose").ConnectionStates}.
 */
export type DatabaseConnectionState =
  | "disconnected"
  | "connected"
  | "connecting"
  | "disconnecting"
  | "uninitialized";

/**
 * Options accepted by {@link import("./connection.js").connectDatabase}.
 *
 * Prefer resolving the URI from `@repo/config` (default) so every service
 * shares one validated connection string. Inject `uri` / `logger` only in
 * tests or specialised composition roots.
 */
export interface ConnectDatabaseOptions {
  /**
   * MongoDB connection URI.
   * Defaults to `getConfig().database.mongodbUri`.
   */
  readonly uri?: string;

  /**
   * Logger used for connection lifecycle events.
   * Defaults to `getLogger()` from `@repo/logger`.
   */
  readonly logger?: AtlasLogger;

  /**
   * Maximum connections in the MongoDB driver pool.
   * Defaults to {@link DEFAULT_DATABASE_OPTIONS.maxPoolSize}.
   */
  readonly maxPoolSize?: number;

  /**
   * Minimum connections kept warm in the pool.
   * Defaults to {@link DEFAULT_DATABASE_OPTIONS.minPoolSize}.
   */
  readonly minPoolSize?: number;

  /**
   * How long the driver waits to select a suitable server before failing.
   * Defaults to {@link DEFAULT_DATABASE_OPTIONS.serverSelectionTimeoutMS}.
   */
  readonly serverSelectionTimeoutMS?: number;

  /**
   * Socket inactivity timeout for established connections.
   * Defaults to {@link DEFAULT_DATABASE_OPTIONS.socketTimeoutMS}.
   */
  readonly socketTimeoutMS?: number;

  /**
   * Timeout for the initial TCP / TLS handshake.
   * Defaults to {@link DEFAULT_DATABASE_OPTIONS.connectTimeoutMS}.
   */
  readonly connectTimeoutMS?: number;

  /**
   * How often the driver sends heartbeats to monitor server health.
   * Defaults to {@link DEFAULT_DATABASE_OPTIONS.heartbeatFrequencyMS}.
   */
  readonly heartbeatFrequencyMS?: number;

  /**
   * When true (default), registers process signal handlers that call
   * {@link import("./connection.js").disconnectDatabase} on graceful shutdown.
   */
  readonly registerShutdownHooks?: boolean;

  /**
   * Signals that trigger graceful disconnect when shutdown hooks are enabled.
   * Defaults to `["SIGINT", "SIGTERM"]`.
   */
  readonly shutdownSignals?: readonly NodeJS.Signals[];

  /**
   * Maximum time allowed for graceful disconnect before the process is
   * forced to exit. Defaults to {@link DEFAULT_DATABASE_OPTIONS.shutdownTimeoutMs}.
   */
  readonly shutdownTimeoutMs?: number;

  /**
   * Extra Mongoose / MongoDB driver options merged after Atlas defaults.
   * Use sparingly — prefer the first-class fields above for common tunables.
   */
  readonly mongooseOptions?: ConnectOptions;
}

/**
 * Result of a MongoDB health probe suitable for readiness / liveness endpoints.
 */
export interface DatabaseHealthStatus {
  /**
   * True when the connection is ready and the ping round-trip succeeded.
   */
  readonly healthy: boolean;

  /**
   * Current Mongoose connection state at the time of the check.
   */
  readonly state: DatabaseConnectionState;

  /**
   * Ping latency in milliseconds when the ping succeeded; otherwise `null`.
   */
  readonly latencyMs: number | null;

  /**
   * ISO-8601 timestamp of when the check completed.
   */
  readonly checkedAt: string;

  /**
   * Short error description when the probe failed.
   */
  readonly error?: string;
}

/**
 * Narrow view of the managed database client exposed to application code.
 *
 * Prefer injecting this interface into repositories / services so tests can
 * substitute a fake without importing Mongoose directly.
 */
export interface DatabaseClient {
  /**
   * Underlying Mongoose connection shared by the process.
   */
  readonly connection: Connection;

  /**
   * Returns true when Mongoose reports `readyState === connected`.
   */
  isConnected(): boolean;

  /**
   * Returns the current lifecycle state.
   */
  getState(): DatabaseConnectionState;

  /**
   * Runs a health probe against the active connection.
   */
  healthCheck(): Promise<DatabaseHealthStatus>;

  /**
   * Closes the connection gracefully.
   */
  disconnect(): Promise<void>;
}

/**
 * Production-sane defaults for the Atlas MongoDB pool and timeouts.
 *
 * The official MongoDB Node driver reconnects automatically after transient
 * network failures when the topology remains opened — no legacy
 * `autoReconnect` flag is required (or supported) on Mongoose 9+.
 */
export const DEFAULT_DATABASE_OPTIONS = {
  maxPoolSize: 10,
  minPoolSize: 0,
  serverSelectionTimeoutMS: 5_000,
  socketTimeoutMS: 45_000,
  connectTimeoutMS: 10_000,
  heartbeatFrequencyMS: 10_000,
  shutdownTimeoutMs: 10_000,
} as const;
