import type { AtlasLogger } from "@repo/logger";
import type { Connection } from "mongoose";

import { DatabaseHealthError } from "./errors.js";
import type { DatabaseHealthStatus } from "./types.js";
import { mapReadyState } from "./utils.js";

/**
 * MongoDB command document used by the health ping.
 */
interface PingCommand {
  readonly ping: 1;
}

/**
 * Response shape returned by the `ping` admin command.
 */
interface PingCommandResult {
  readonly ok?: number;
}

/**
 * Runs a readiness-oriented health check against an open Mongoose connection.
 *
 * Uses the admin `ping` command so the probe exercises the network path and
 * authentication, not only the local ready-state flag.
 *
 * @param connection - Active Mongoose connection.
 * @param logger - Optional logger for soft-failure diagnostics.
 * @returns Structured {@link DatabaseHealthStatus} (never throws for ping failures).
 */
export async function checkDatabaseHealth(
  connection: Connection,
  logger?: AtlasLogger,
): Promise<DatabaseHealthStatus> {
  const checkedAt = new Date().toISOString();
  const state = mapReadyState(connection.readyState);

  if (connection.readyState !== 1) {
    return {
      healthy: false,
      state,
      latencyMs: null,
      checkedAt,
      error: `MongoDB is not connected (state=${state})`,
    };
  }

  const db = connection.db;

  if (db === undefined) {
    return {
      healthy: false,
      state,
      latencyMs: null,
      checkedAt,
      error: "MongoDB native Db handle is unavailable",
    };
  }

  const startedAt = performance.now();

  try {
    const result = (await db.command({
      ping: 1,
    } satisfies PingCommand)) as PingCommandResult;

    const latencyMs = Math.round(performance.now() - startedAt);

    if (result.ok !== 1) {
      const message = "MongoDB ping command did not return ok=1";
      logger?.warn({ state, latencyMs, result }, message);
      return {
        healthy: false,
        state,
        latencyMs,
        checkedAt: new Date().toISOString(),
        error: message,
      };
    }

    return {
      healthy: true,
      state,
      latencyMs,
      checkedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const message =
      error instanceof Error ? error.message : "MongoDB health ping failed";

    logger?.warn({ err: error, state, latencyMs }, "MongoDB health check failed");

    return {
      healthy: false,
      state,
      latencyMs,
      checkedAt: new Date().toISOString(),
      error: message,
    };
  }
}

/**
 * Asserts that a health probe succeeded; throws when unhealthy.
 *
 * Useful for bootstrap gates that must refuse to serve traffic until MongoDB
 * is reachable.
 *
 * @param connection - Active Mongoose connection.
 * @param logger - Optional logger forwarded to {@link checkDatabaseHealth}.
 * @returns The successful health payload.
 * @throws {DatabaseHealthError} When the probe reports unhealthy.
 */
export async function assertDatabaseHealthy(
  connection: Connection,
  logger?: AtlasLogger,
): Promise<DatabaseHealthStatus> {
  const status = await checkDatabaseHealth(connection, logger);

  if (!status.healthy) {
    throw new DatabaseHealthError(
      status.error ?? "MongoDB health check failed",
    );
  }

  return status;
}
