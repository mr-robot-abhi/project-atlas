import { ZodError, z } from "zod";

/**
 * Thrown when environment validation fails.
 *
 * The process should treat this as a fatal bootstrap error and exit
 * immediately — never silently continue with partial config.
 */
export class ConfigValidationError extends Error {
  /**
   * Creates a fatal configuration validation error.
   *
   * @param message - Human-readable summary describing the failure.
   * @param issues - Structured Zod issues for programmatic consumers.
   */
  public constructor(
    message: string,
    public readonly issues: readonly z.core.$ZodIssue[],
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

/**
 * Formats a Zod validation failure into a readable multi-line message.
 *
 * @param error - The Zod error produced by schema parsing.
 * @returns A multi-line string listing each invalid environment variable.
 */
export function formatConfigError(error: ZodError): string {
  const header = "Invalid Atlas configuration — failing fast:";
  const details = error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `  - ${path}: ${issue.message}`;
    })
    .join("\n");

  return `${header}\n${details}`;
}
