/**
 * The single funnel every repository puts a driver error through (DB7-CP2).
 *
 * Two layers: an exact constraint-name lookup for the arbiters that carry a
 * distinct business meaning, and deterministic SQLSTATE-family rules for
 * everything else. Nothing falls through unclassified, and no branch copies a
 * driver message, DETAIL, SQL text or row value into the result — the messages
 * below are fixed strings chosen ahead of time.
 */
import { extractDriverError } from './driver-error';
import type { DriverError } from './driver-error';
import { CONSTRAINT_MEANINGS } from './constraint-catalog';
import type { ConstraintMeaning } from './constraint-catalog';
import { PersistenceError } from './persistence-error';
import type { PersistenceErrorKind } from './persistence-error';
import { TransactionRequiredError } from './transaction-required-error';

/** libpq/Node connection-layer errnos, as opposed to a SQLSTATE. */
const CONNECTION_ERRNOS: ReadonlySet<string> = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
]);

interface Classification {
  readonly kind: PersistenceErrorKind;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly replayable: boolean;
}

const GENERIC: Classification = {
  kind: 'UNKNOWN_PERSISTENCE_FAILURE',
  code: 'PERSISTENCE_FAILURE',
  message: 'The operation could not be completed.',
  retryable: false,
  replayable: false,
};

function fromCatalog(meaning: ConstraintMeaning): Classification {
  return {
    kind: meaning.kind,
    code: meaning.code,
    message: meaning.message,
    retryable: false,
    replayable: meaning.replayable === true,
  };
}

/**
 * SQLSTATE-family rules.
 *
 * `23000` is the S24 immutability triggers' contract (migration `0030`,
 * `DB6_S24_TRIGGER_REPORT.md`), not a generic integrity error — every one of
 * the 30 triggers raises exactly that code, so the mapping is unambiguous.
 */
function classifyBySqlState(driver: DriverError): Classification {
  switch (driver.code) {
    case '23505':
      return {
        kind: 'CONFLICT',
        code: 'DUPLICATE_RESOURCE',
        message: 'That value is already in use.',
        retryable: false,
        replayable: false,
      };
    case '23503':
      return {
        kind: 'INVALID_REFERENCE',
        code: 'REFERENCE_NOT_FOUND',
        message: 'A referenced record does not exist, or is still in use.',
        retryable: false,
        replayable: false,
      };
    case '23514':
      return {
        kind: 'INVARIANT_VIOLATION',
        code: 'VALUE_NOT_ALLOWED',
        message: 'The submitted values are not valid for this record.',
        retryable: false,
        replayable: false,
      };
    case '23502':
      return {
        kind: 'INVARIANT_VIOLATION',
        code: 'REQUIRED_VALUE_MISSING',
        message: 'A required value is missing.',
        retryable: false,
        replayable: false,
      };
    case '23000':
      return {
        kind: 'IMMUTABLE_EVIDENCE',
        code: 'IMMUTABLE_RECORD',
        message: 'This record is immutable and cannot be changed or removed.',
        retryable: false,
        replayable: false,
      };
    case '23001':
      return {
        kind: 'INVALID_REFERENCE',
        code: 'REFERENCE_IN_USE',
        message: 'That record is still referenced and cannot be removed.',
        retryable: false,
        replayable: false,
      };
    case '55P03':
      return {
        kind: 'CONCURRENT_MODIFICATION',
        code: 'RESOURCE_LOCKED',
        message: 'The record is being changed by another operation; please retry.',
        // Not marked retryable: the lock holder may hold it for a long time, so
        // an automatic retry belongs to a policy that can back off, not here.
        retryable: false,
        replayable: false,
      };
    case '40001':
    case '40P01':
      return {
        kind: 'RETRYABLE_TRANSACTION_FAILURE',
        code: 'TRANSIENT_CONFLICT',
        message: 'The operation conflicted with another and can be retried.',
        retryable: true,
        replayable: false,
      };
    case '57014':
      return {
        kind: 'CONCURRENT_MODIFICATION',
        code: 'OPERATION_TIMED_OUT',
        message: 'The operation took too long and was cancelled.',
        retryable: false,
        replayable: false,
      };
    case '25006':
      return {
        kind: 'INVARIANT_VIOLATION',
        code: 'READ_ONLY_TRANSACTION',
        message: 'This operation cannot write inside a read-only transaction.',
        retryable: false,
        replayable: false,
      };
    case '53300':
    case '57P01':
    case '57P02':
    case '57P03':
      return unavailable('DATABASE_UNAVAILABLE');
    case '3D000':
      return unavailable('DATABASE_MISCONFIGURED');
    default:
      return classifyByPrefix(driver.code);
  }
}

function classifyByPrefix(code: string): Classification {
  if (CONNECTION_ERRNOS.has(code)) {
    return unavailable('DATABASE_UNAVAILABLE');
  }
  // Class 08 = connection exception; class 28 = invalid authorization.
  if (code.startsWith('08')) {
    return unavailable('DATABASE_UNAVAILABLE');
  }
  if (code.startsWith('28')) {
    return unavailable('DATABASE_MISCONFIGURED');
  }
  return GENERIC;
}

function unavailable(code: string): Classification {
  return {
    kind: 'DATABASE_UNAVAILABLE',
    code,
    message: 'The service is temporarily unable to reach its data store.',
    retryable: true,
    replayable: false,
  };
}

/**
 * Maps whatever the query layer threw into a client-safe application error.
 *
 * `operation` is a caller-supplied label such as
 * `OrderRepository.createFromAcceptedQuotation`. It is diagnostic only: it
 * reaches the log, never the message.
 */
export function mapDatabaseError(error: unknown, operation?: string): PersistenceError {
  // Already mapped — re-mapping would lose the specific classification.
  if (error instanceof PersistenceError) {
    return error;
  }
  // A forgotten transaction boundary is a programming error. Classifying it as
  // a persistence failure would replace the one message naming the actual
  // mistake with a generic one, leaving the bug undiagnosable from a log.
  if (error instanceof TransactionRequiredError) {
    throw error;
  }

  const driver = extractDriverError(error);
  const meaning =
    driver?.constraint === undefined ? undefined : CONSTRAINT_MEANINGS[driver.constraint];
  const classification =
    meaning !== undefined
      ? fromCatalog(meaning)
      : driver === undefined
        ? GENERIC
        : classifyBySqlState(driver);

  return new PersistenceError({
    ...classification,
    diagnostics: {
      sqlState: driver?.code,
      constraint: driver?.constraint,
      table: driver?.table,
      operation,
    },
    cause: error,
  });
}

/**
 * Runs `work`, mapping any driver error on the way out.
 *
 * Repositories wrap their bodies in this rather than each writing a try/catch,
 * so a new method cannot forget the mapping and leak a raw Postgres error.
 */
export async function withMappedErrors<T>(operation: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error: unknown) {
    throw mapDatabaseError(error, operation);
  }
}
