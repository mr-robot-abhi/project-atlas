import mongoose, { type Connection } from "mongoose";

import type { DatabaseConnectionState } from "./types.js";

/**
 * Maps a numeric Mongoose ready-state to a durable string label.
 *
 * @param readyState - Value from `connection.readyState`.
 * @returns Stable {@link DatabaseConnectionState} for APIs and health payloads.
 */
export function mapReadyState(
  readyState: Connection["readyState"],
): DatabaseConnectionState {
  const { ConnectionStates } = mongoose;

  switch (readyState) {
    case ConnectionStates.disconnected:
      return "disconnected";
    case ConnectionStates.connected:
      return "connected";
    case ConnectionStates.connecting:
      return "connecting";
    case ConnectionStates.disconnecting:
      return "disconnecting";
    case ConnectionStates.uninitialized:
      return "uninitialized";
    default: {
      return "disconnected";
    }
  }
}

/**
 * Redacts credentials from a MongoDB URI for safe logging.
 *
 * Replaces `user:password@` with `***@` while preserving host and path.
 *
 * @param uri - Raw MongoDB connection string.
 * @returns URI with credentials masked.
 */
export function redactMongoUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      parsed.username = "***";
      parsed.password = "";
      return parsed.toString();
    }
    return uri;
  } catch {
    return uri.replace(/\/\/([^/@]+)@/u, "//***@");
  }
}
