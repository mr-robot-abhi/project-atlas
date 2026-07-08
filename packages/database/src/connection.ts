import { getConfig } from "@repo/config";
import { getLogger, type AtlasLogger } from "@repo/logger";
import mongoose, { type ConnectOptions, type Connection } from "mongoose";

import { DatabaseConnectionError } from "./errors.js";
import { checkDatabaseHealth } from "./health.js";
import {
  registerDatabaseShutdownHooks,
  type ShutdownHookRegistration,
} from "./shutdown.js";
import {
  DEFAULT_DATABASE_OPTIONS,
  type ConnectDatabaseOptions,
  type DatabaseClient,
  type DatabaseConnectionState,
  type DatabaseHealthStatus,
} from "./types.js";
import { mapReadyState, redactMongoUri } from "./utils.js";

/**
 * In-flight connection promise used to coalesce concurrent connect calls.
 */
let connectPromise: Promise<DatabaseClient> | undefined;

/**
 * Cached process-wide database client after a successful connect.
 */
let cachedClient: DatabaseClient | undefined;

/**
 * Active shutdown-hook registration (if any) for the current connection.
 */
let shutdownHooks: ShutdownHookRegistration | undefined;

/**
 * True while {@link disconnectDatabase} is closing the connection so
 * reconnect / disconnect event handlers do not race against intentional teardown.
 */
let isDisconnecting = false;

/**
 * Builds merged Mongoose connect options from Atlas defaults and caller overrides.
 *
 * @param options - Caller-supplied connect options.
 * @returns Mongoose {@link ConnectOptions} ready for `mongoose.connect`.
 */
function buildConnectOptions(options: ConnectDatabaseOptions): ConnectOptions {
  const {
    maxPoolSize = DEFAULT_DATABASE_OPTIONS.maxPoolSize,
    minPoolSize = DEFAULT_DATABASE_OPTIONS.minPoolSize,
    serverSelectionTimeoutMS = DEFAULT_DATABASE_OPTIONS.serverSelectionTimeoutMS,
    socketTimeoutMS = DEFAULT_DATABASE_OPTIONS.socketTimeoutMS,
    connectTimeoutMS = DEFAULT_DATABASE_OPTIONS.connectTimeoutMS,
    heartbeatFrequencyMS = DEFAULT_DATABASE_OPTIONS.heartbeatFrequencyMS,
    mongooseOptions,
  } = options;

  return {
    maxPoolSize,
    minPoolSize,
    serverSelectionTimeoutMS,
    socketTimeoutMS,
    connectTimeoutMS,
    heartbeatFrequencyMS,
    // Skip auto-indexing in production; build indexes via migrations / startup jobs.
    autoIndex: process.env["NODE_ENV"] !== "production",
    ...mongooseOptions,
  };
}

/**
 * Resolves the MongoDB URI from options or `@repo/config`.
 *
 * @param options - Caller-supplied connect options.
 * @returns Non-empty MongoDB URI.
 * @throws {DatabaseConnectionError} When no URI can be resolved.
 */
function resolveUri(options: ConnectDatabaseOptions): string {
  if (options.uri !== undefined && options.uri.trim().length > 0) {
    return options.uri.trim();
  }

  try {
    return getConfig().database.mongodbUri;
  } catch (error: unknown) {
    throw new DatabaseConnectionError(
      "MongoDB URI is required: pass `uri` or load `@repo/config` before connecting",
      { cause: error },
    );
  }
}

/**
 * Resolves the logger used for connection lifecycle events.
 *
 * @param options - Caller-supplied connect options.
 * @returns An {@link AtlasLogger} instance.
 */
function resolveLogger(options: ConnectDatabaseOptions): AtlasLogger {
  return options.logger ?? getLogger().child({ component: "database" });
}

/**
 * Named listener references so reconnect / re-connect flows can detach only
 * Atlas handlers without wiping Mongoose or driver internals.
 */
interface ConnectionLifecycleListeners {
  readonly onConnected: () => void;
  readonly onReconnected: () => void;
  readonly onDisconnected: () => void;
  readonly onError: (error: Error) => void;
  readonly onClose: () => void;
}

/**
 * Currently attached Atlas lifecycle listeners (if any).
 */
let lifecycleListeners: ConnectionLifecycleListeners | undefined;

/**
 * Detaches previously registered Atlas connection lifecycle listeners.
 *
 * @param connection - Mongoose connection previously instrumented.
 */
function detachConnectionEventListeners(connection: Connection): void {
  if (lifecycleListeners === undefined) {
    return;
  }

  connection.off("connected", lifecycleListeners.onConnected);
  connection.off("reconnected", lifecycleListeners.onReconnected);
  connection.off("disconnected", lifecycleListeners.onDisconnected);
  connection.off("error", lifecycleListeners.onError);
  connection.off("close", lifecycleListeners.onClose);
  lifecycleListeners = undefined;
}

/**
 * Attaches connection event listeners for observability and automatic recovery logs.
 *
 * The MongoDB Node driver retains topology monitors and reconnects transparently
 * after transient failures; these listeners surface that lifecycle to operators.
 *
 * @param connection - Mongoose default connection.
 * @param logger - Lifecycle logger.
 */
function attachConnectionEventListeners(
  connection: Connection,
  logger: AtlasLogger,
): void {
  detachConnectionEventListeners(connection);

  const listeners: ConnectionLifecycleListeners = {
    onConnected: () => {
      logger.info(
        { state: mapReadyState(connection.readyState) },
        "MongoDB connected",
      );
    },
    onReconnected: () => {
      logger.info(
        { state: mapReadyState(connection.readyState) },
        "MongoDB reconnected",
      );
    },
    onDisconnected: () => {
      if (isDisconnecting) {
        logger.debug("MongoDB disconnected during graceful teardown");
        return;
      }

      logger.warn(
        { state: mapReadyState(connection.readyState) },
        "MongoDB disconnected; driver will attempt automatic reconnect",
      );
    },
    onError: (error: Error) => {
      logger.error({ err: error }, "MongoDB connection error");
    },
    onClose: () => {
      logger.debug("MongoDB connection closed");
    },
  };

  connection.on("connected", listeners.onConnected);
  connection.on("reconnected", listeners.onReconnected);
  connection.on("disconnected", listeners.onDisconnected);
  connection.on("error", listeners.onError);
  connection.on("close", listeners.onClose);
  lifecycleListeners = listeners;
}

/**
 * Creates the {@link DatabaseClient} façade over the shared Mongoose connection.
 *
 * @param connection - Mongoose connection to wrap.
 * @param logger - Logger used by health / disconnect helpers.
 * @returns Documented database client API.
 */
function createDatabaseClient(
  connection: Connection,
  logger: AtlasLogger,
): DatabaseClient {
  const client: DatabaseClient = {
    connection,
    isConnected(): boolean {
      return connection.readyState === 1;
    },
    getState(): DatabaseConnectionState {
      return mapReadyState(connection.readyState);
    },
    healthCheck(): Promise<DatabaseHealthStatus> {
      return checkDatabaseHealth(connection, logger);
    },
    disconnect(): Promise<void> {
      return disconnectDatabase();
    },
  };

  return client;
}

/**
 * Performs the actual mongoose.connect call and wires lifecycle concerns.
 *
 * @param options - Connect options after URI / logger resolution.
 * @returns Connected {@link DatabaseClient}.
 */
async function openConnection(
  options: ConnectDatabaseOptions,
): Promise<DatabaseClient> {
  const uri = resolveUri(options);
  const logger = resolveLogger(options);
  const connectOptions = buildConnectOptions(options);
  const redactedUri = redactMongoUri(uri);

  logger.info(
    {
      uri: redactedUri,
      maxPoolSize: connectOptions.maxPoolSize,
      minPoolSize: connectOptions.minPoolSize,
    },
    "Connecting to MongoDB",
  );

  try {
    await mongoose.connect(uri, connectOptions);
  } catch (error: unknown) {
    connectPromise = undefined;
    throw new DatabaseConnectionError(
      `Failed to connect to MongoDB at ${redactedUri}`,
      { cause: error },
    );
  }

  const connection = mongoose.connection;
  attachConnectionEventListeners(connection, logger);

  const client = createDatabaseClient(connection, logger);
  cachedClient = client;

  const registerHooks = options.registerShutdownHooks ?? true;
  if (registerHooks) {
    shutdownHooks?.unregister();
    shutdownHooks = registerDatabaseShutdownHooks({
      signals: options.shutdownSignals ?? ["SIGINT", "SIGTERM"],
      logger,
      timeoutMs:
        options.shutdownTimeoutMs ??
        DEFAULT_DATABASE_OPTIONS.shutdownTimeoutMs,
      onSignal: async () => {
        await disconnectDatabase();
      },
    });
  }

  logger.info(
    {
      state: client.getState(),
      host: connection.host,
      name: connection.name,
    },
    "MongoDB connection established",
  );

  return client;
}

/**
 * Establishes (or returns) the process-wide MongoDB connection singleton.
 *
 * Concurrent callers share a single in-flight promise. Subsequent calls after
 * a successful connect return the cached {@link DatabaseClient} without
 * re-opening the socket pool.
 *
 * Automatic reconnect is provided by the MongoDB Node driver while the
 * connection remains open — transient network blips are recovered without
 * application intervention. Prefer {@link disconnectDatabase} only for
 * process shutdown or intentional teardown.
 *
 * @param options - URI, pool, logger, and shutdown overrides.
 * @returns Shared {@link DatabaseClient}.
 * @throws {DatabaseConnectionError} When the initial connect fails.
 */
export async function connectDatabase(
  options: ConnectDatabaseOptions = {},
): Promise<DatabaseClient> {
  // Return the existing client even during a transient disconnect so the
  // driver's automatic reconnect continues against one shared connection.
  if (cachedClient !== undefined) {
    return cachedClient;
  }

  if (connectPromise !== undefined) {
    return connectPromise;
  }

  connectPromise = openConnection(options).catch((error: unknown) => {
    connectPromise = undefined;
    throw error;
  });

  return connectPromise;
}

/**
 * Returns the cached database client.
 *
 * @returns The process singleton {@link DatabaseClient}.
 * @throws {DatabaseConnectionError} When {@link connectDatabase} has not succeeded.
 */
export function getDatabase(): DatabaseClient {
  if (cachedClient === undefined) {
    throw new DatabaseConnectionError(
      "Database has not been connected — call connectDatabase() during bootstrap",
    );
  }

  return cachedClient;
}

/**
 * Returns whether a database client has been established in this process.
 *
 * Does not imply the socket is currently healthy — use
 * {@link DatabaseClient.isConnected} or {@link DatabaseClient.healthCheck}.
 *
 * @returns True when {@link connectDatabase} has produced a client.
 */
export function hasDatabase(): boolean {
  return cachedClient !== undefined;
}

/**
 * Returns the underlying Mongoose connection from the singleton.
 *
 * Convenience helper for repositories that already depend on Mongoose types.
 *
 * @returns Active {@link Connection}.
 * @throws {DatabaseConnectionError} When no connection has been established.
 */
export function getConnection(): Connection {
  return getDatabase().connection;
}

/**
 * Gracefully closes the shared MongoDB connection and clears the singleton.
 *
 * Safe to call multiple times. Unregisters shutdown hooks installed by
 * {@link connectDatabase}. Prefer this at process exit rather than relying
 * solely on the Node event-loop drain.
 *
 * @returns Resolves when the connection is fully closed (or was already closed).
 */
export async function disconnectDatabase(): Promise<void> {
  if (cachedClient === undefined && connectPromise === undefined) {
    return;
  }

  isDisconnecting = true;

  try {
    shutdownHooks?.unregister();
    shutdownHooks = undefined;
    detachConnectionEventListeners(mongoose.connection);

    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  } catch (error: unknown) {
    throw new DatabaseConnectionError("Failed to disconnect from MongoDB", {
      cause: error,
    });
  } finally {
    cachedClient = undefined;
    connectPromise = undefined;
    isDisconnecting = false;
  }
}

/**
 * Clears the process-local database singleton without closing sockets.
 *
 * Intended for unit tests that stub connection state. Prefer
 * {@link disconnectDatabase} in integration tests that opened a real connection.
 */
export function resetDatabaseForTests(): void {
  shutdownHooks?.unregister();
  shutdownHooks = undefined;
  lifecycleListeners = undefined;
  cachedClient = undefined;
  connectPromise = undefined;
  isDisconnecting = false;
}
