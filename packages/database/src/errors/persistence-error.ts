/**
 * The application-safe error taxonomy the persistence layer raises (DB7-CP2).
 *
 * Nothing above infrastructure ever sees a SQLSTATE, a constraint name, SQL
 * text or a row value. The two diagnostic fields that *are* useful in an
 * operator log — the SQLSTATE and the constraint name, both of which are our
 * own identifiers rather than user data — live on a non-enumerable
 * `diagnostics` property, so serialising the error for a client cannot include
 * them by accident. That is asserted by a test, not just intended.
 */

export type PersistenceErrorKind =
  /** A uniqueness arbiter rejected the write. */
  | 'CONFLICT'
  /** A referenced row does not exist, or a no-FK reference did not resolve. */
  | 'INVALID_REFERENCE'
  /** A business rule expressed as a CHECK, or an application guard, was violated. */
  | 'INVARIANT_VIOLATION'
  /** An immutability / append-only guard rejected an UPDATE or DELETE. */
  | 'IMMUTABLE_EVIDENCE'
  /** The row is locked, or changed underneath the caller. */
  | 'CONCURRENT_MODIFICATION'
  /** Serialization failure or deadlock: the whole transaction may be retried. */
  | 'RETRYABLE_TRANSACTION_FAILURE'
  /** The database is unreachable, misconfigured, or refused the connection. */
  | 'DATABASE_UNAVAILABLE'
  /** Anything unrecognised. Never carries the original message. */
  | 'UNKNOWN_PERSISTENCE_FAILURE';

export interface PersistenceErrorDiagnostics {
  /** SQLSTATE or libpq errno. Log-only. */
  readonly sqlState: string | undefined;
  /** Constraint/index name the server named. Log-only. */
  readonly constraint: string | undefined;
  /** Table the server named. Log-only. */
  readonly table: string | undefined;
  /** The operation label the repository passed in. Log-only. */
  readonly operation: string | undefined;
}

export interface PersistenceErrorOptions {
  readonly kind: PersistenceErrorKind;
  /** Stable, client-safe code (e.g. `ORDER_ALREADY_EXISTS_FOR_REQUEST`). */
  readonly code: string;
  /** Client-safe message. Must never interpolate a database value. */
  readonly message: string;
  /** True when retrying the whole transaction can plausibly succeed. */
  readonly retryable: boolean;
  /**
   * True when this rejection is the *expected* signal of a duplicate operation
   * and the caller should replay the earlier result instead of failing —
   * idempotency claims, provider-event ingestion, notification intents.
   */
  readonly replayable: boolean;
  readonly diagnostics: PersistenceErrorDiagnostics;
  readonly cause?: unknown;
}

export class PersistenceError extends Error {
  readonly kind: PersistenceErrorKind;
  readonly code: string;
  readonly retryable: boolean;
  readonly replayable: boolean;

  /**
   * Operator-facing detail. Non-enumerable so `JSON.stringify(error)` and
   * object spreads cannot copy it into a response body.
   */
  readonly diagnostics!: PersistenceErrorDiagnostics;

  constructor(options: PersistenceErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'PersistenceError';
    this.kind = options.kind;
    this.code = options.code;
    this.retryable = options.retryable;
    this.replayable = options.replayable;

    Object.defineProperty(this, 'diagnostics', {
      value: options.diagnostics,
      enumerable: false,
      writable: false,
      configurable: false,
    });
  }

  /** A structured, client-safe line for an application log. */
  describeForLog(): string {
    const parts = [`kind=${this.kind}`, `code=${this.code}`];
    if (this.diagnostics.operation !== undefined) {
      parts.push(`operation=${this.diagnostics.operation}`);
    }
    if (this.diagnostics.sqlState !== undefined) {
      parts.push(`sqlstate=${this.diagnostics.sqlState}`);
    }
    if (this.diagnostics.constraint !== undefined) {
      parts.push(`constraint=${this.diagnostics.constraint}`);
    }
    return parts.join(' ');
  }
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}
