/**
 * Opaque keyset-pagination cursors (ADR-DB5-001, DB7 §10.5).
 *
 * DB5 selected keyset over offset for every launch-critical list, so a cursor
 * carries the ordering values of the last row seen rather than a row count.
 *
 * The encoding is base64url over JSON — opaque to a client, but deliberately
 * *not* a security boundary: it is tamper-evident only in the sense that a
 * malformed cursor is rejected. The values inside it are ordering keys the
 * caller already saw in the previous page, so nothing is disclosed by
 * decoding one. What matters is that a decoded cursor is validated: an
 * unvalidated cursor spliced into a WHERE clause is how keyset pagination
 * turns into an injection or a silent full scan.
 */

/** Bounds a client-supplied page size (DB7 §21: results must be bounded). */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** Guards against a hostile cursor forcing a large JSON parse. */
const MAX_CURSOR_LENGTH = 512;

export interface KeysetCursor {
  /** The ordering value of the last row on the previous page. */
  readonly sortValue: string;
  /** The tie-breaker id of that row — DB5 requires every keyset order to have one. */
  readonly tieBreaker: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    // No detail: echoing why a cursor failed to parse tells a prober how the
    // encoding works and adds nothing for a legitimate caller, who can only
    // ever have got a cursor from a previous page.
    super('The supplied pagination cursor is not valid.');
    this.name = 'InvalidCursorError';
  }
}

export function encodeCursor(cursor: KeysetCursor): string {
  const payload = JSON.stringify([cursor.sortValue, cursor.tieBreaker]);
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Decodes and validates a cursor.
 *
 * Every failure mode — wrong length, bad base64, bad JSON, wrong shape, wrong
 * member types — produces the same `InvalidCursorError`, so a caller cannot
 * probe the format by comparing messages.
 */
export function decodeCursor(encoded: string): KeysetCursor {
  if (encoded.length === 0 || encoded.length > MAX_CURSOR_LENGTH) {
    throw new InvalidCursorError();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidCursorError();
  }

  if (!Array.isArray(parsed) || parsed.length !== 2) {
    throw new InvalidCursorError();
  }
  const [sortValue, tieBreaker] = parsed;
  if (typeof sortValue !== 'string' || typeof tieBreaker !== 'string') {
    throw new InvalidCursorError();
  }

  return { sortValue, tieBreaker };
}

export interface PageRequest {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface Page<T> {
  readonly items: readonly T[];
  /** Absent when this is the last page. */
  readonly nextCursor: string | undefined;
}

/**
 * Clamps a client-supplied limit into the allowed range.
 *
 * Clamps rather than rejects: a caller asking for 1000 rows wants "as many as
 * possible", and failing the request teaches nothing. A caller asking for 0 or
 * a fraction has a bug, so that does reject.
 */
export function resolveLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return DEFAULT_PAGE_SIZE;
  }
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`Invalid page size ${String(limit)}: expected a positive integer.`);
  }
  return Math.min(limit, MAX_PAGE_SIZE);
}

/**
 * Builds a page from rows fetched with `limit + 1`.
 *
 * Over-fetching by one is how "is there a next page" is answered without a
 * second COUNT query — the extra row is discarded, never returned.
 */
export function buildPage<T>(
  rows: readonly T[],
  limit: number,
  toCursor: (row: T) => KeysetCursor,
): Page<T> {
  if (rows.length <= limit) {
    return { items: rows, nextCursor: undefined };
  }
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: last === undefined ? undefined : encodeCursor(toCursor(last)),
  };
}
