/**
 * Extracts the PostgreSQL driver error from whatever the query layer threw.
 *
 * Drizzle wraps a `pg` error in its own error object and attaches the original
 * as `cause`, so reading `error.code` directly finds nothing — which silently
 * turns every mapped SQLSTATE into "unknown failure". DB7-CP1's health tests
 * caught exactly that, so every consumer goes through this one unwrapper
 * instead of reaching for `.code` itself.
 *
 * Framework-free on purpose: the NestJS runtime, the CLIs and the integration
 * harness must all classify an error the same way.
 */

/** Depth limit: a cause chain is normally 1–2 deep; anything longer is a cycle or a bug. */
const MAX_CAUSE_DEPTH = 8;

/**
 * The fields of a `pg` DatabaseError this system reads.
 *
 * Deliberately narrow. `detail`, `where`, `internalQuery` and the row values
 * they can contain are **never** read, so they cannot be copied into an
 * application error and leak (`DB7` §18).
 */
export interface DriverError {
  /** SQLSTATE (e.g. `23505`) or a libpq/Node errno (e.g. `ECONNREFUSED`). */
  readonly code: string;
  /** Constraint name, when the server identified one. Safe: names are ours, not user data. */
  readonly constraint: string | undefined;
  /** Table name, when the server identified one. Safe for the same reason. */
  readonly table: string | undefined;
}

function readString(source: object, key: string): string | undefined {
  if (!(key in source)) {
    return undefined;
  }
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function extractDriverError(error: unknown): DriverError | undefined {
  let current: unknown = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    const code = readString(current, 'code');
    if (code !== undefined) {
      return {
        code,
        constraint: readString(current, 'constraint'),
        table: readString(current, 'table'),
      };
    }

    if (!('cause' in current)) {
      return undefined;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return undefined;
}

/** Convenience for call sites that only need the code. */
export function driverErrorCode(error: unknown): string | undefined {
  return extractDriverError(error)?.code;
}
