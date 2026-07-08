/**
 * Error thrown when the MongoDB connection cannot be established or is used
 * before {@link import("./connection.js").connectDatabase} completes.
 */
export class DatabaseConnectionError extends Error {
  /**
   * Creates a typed connection failure.
   *
   * @param message - Human-readable description of the failure.
   * @param options - Optional native `Error` options (e.g. `cause`).
   */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseConnectionError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when a health probe fails against an otherwise open connection.
 */
export class DatabaseHealthError extends Error {
  /**
   * Creates a typed health-check failure.
   *
   * @param message - Human-readable description of the failure.
   * @param options - Optional native `Error` options (e.g. `cause`).
   */
  public constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "DatabaseHealthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
