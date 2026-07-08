import { stdSerializers } from "pino";

/**
 * Serializable shape produced by {@link serializeError}.
 *
 * Includes standard error fields plus optional nested `cause` so
 * error chains remain visible in JSON log aggregators.
 */
export interface SerializedError {
  /**
   * Error type name (e.g. `"TypeError"`).
   */
  readonly type: string;

  /**
   * Error message.
   */
  readonly message: string;

  /**
   * Stack trace when available.
   */
  readonly stack?: string;

  /**
   * Serialized `error.cause` when present.
   */
  readonly cause?: SerializedError;

  /**
   * Additional enumerable own properties from the original error.
   */
  readonly [key: string]: unknown;
}

/**
 * Copies enumerable own properties from an Error onto a plain object,
 * excluding well-known fields that are handled explicitly.
 *
 * @param error - Source Error instance.
 * @returns Extra fields safe to merge into a serialized payload.
 */
function collectExtraErrorFields(error: Error): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  const reserved = new Set(["name", "message", "stack", "cause"]);

  for (const key of Reflect.ownKeys(error)) {
    if (typeof key !== "string" || reserved.has(key)) {
      continue;
    }

    const value = Reflect.get(error, key);

    if (typeof value !== "function") {
      extras[key] = value;
    }
  }

  return extras;
}

/**
 * Attaches a nested `cause` field when the thrown value has one.
 *
 * @param serialized - Base serialized error without cause.
 * @param cause - Optional cause value from `Error.cause`.
 * @returns Serialized error, with nested cause when present.
 */
function withOptionalCause(
  serialized: SerializedError,
  cause: unknown,
): SerializedError {
  if (cause === undefined || cause === null) {
    return serialized;
  }

  return {
    ...serialized,
    cause: serializeError(cause),
  };
}

/**
 * Serializes an unknown thrown value into a structured, JSON-safe object.
 *
 * Prefer passing errors as `{ err }` so Pino’s registered `err` serializer runs;
 * use this helper when you need an explicit serialized payload (for example
 * inside custom transports or tests). Cause chains are preserved as nested
 * `cause` objects rather than being folded into `message`.
 *
 * @param error - Value caught from a `catch` clause or similar.
 * @returns A plain object suitable for structured logging.
 */
export function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    const serialized: SerializedError = {
      type: error.name,
      message: error.message,
      ...collectExtraErrorFields(error),
    };

    if (error.stack !== undefined) {
      return withOptionalCause(
        {
          ...serialized,
          stack: error.stack,
        },
        Reflect.get(error, "cause"),
      );
    }

    return withOptionalCause(serialized, Reflect.get(error, "cause"));
  }

  if (typeof error === "string") {
    return {
      type: "NonError",
      message: error,
    };
  }

  if (typeof error === "object" && error !== null) {
    try {
      return {
        type: "NonError",
        message: JSON.stringify(error),
      };
    } catch {
      return {
        type: "NonError",
        message: "[unserializable object]",
      };
    }
  }

  return {
    type: "NonError",
    message: String(error),
  };
}

/**
 * Pino serializers registered on every Atlas logger.
 *
 * The `err` key uses {@link serializeError} so `logger.error({ err }, msg)`
 * produces consistent `type`, `message`, `stack`, and nested `cause` fields.
 * The `error` alias covers call sites that use `{ error }` instead of `{ err }`.
 * HTTP helpers reuse Pino’s standard `req` / `res` serializers.
 */
export const loggerSerializers = {
  err: serializeError,
  error: serializeError,
  req: stdSerializers.req,
  res: stdSerializers.res,
} as const;
