import { REDACTED_MARKER, isSensitiveKey, redactString } from './log-redaction';

/**
 * Structural sanitiser for caller-provided log values (APP0-B05).
 *
 * Turns any value a caller passes as a log field into something safe and
 * bounded to serialise: it never mutates the input, never throws, never
 * recurses without bound, and collapses anything hostile (a circular graph, a
 * throwing getter, a multi-megabyte string, a huge array) to a marker instead
 * of crashing the logger or flooding the sink. Key-based and value-based
 * redaction are applied as it walks, so secrets are removed before a record is
 * ever handed to the sink.
 */

/** Bounds that keep a single record small and a hostile input harmless. */
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 100;
const MAX_OBJECT_KEYS = 100;
const MAX_STRING_LENGTH = 2_000;

const CIRCULAR_MARKER = '[Circular]';
const TRUNCATED_MARKER = '[Truncated]';
const UNREADABLE_MARKER = '[Unreadable]';

/**
 * Returns a safe, bounded copy of `value`.
 *
 * `seen` tracks the ancestor objects on the current path so a cycle is marked
 * rather than followed. A `WeakSet` is used, and entries are removed on the way
 * back up, so sharing the same object in sibling positions is not mistaken for a
 * cycle.
 */
export function sanitizeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case 'string':
      return truncateString(redactString(value));
    case 'number':
      return Number.isFinite(value) ? value : String(value);
    case 'boolean':
      return value;
    case 'bigint':
      return `${value.toString()}n`;
    case 'undefined':
    case 'function':
    case 'symbol':
      // Dropped by the caller (object/array walkers omit an undefined result).
      return undefined;
    default:
      return sanitizeObjectLike(value, depth, seen);
  }
}

function truncateString(value: string): string {
  return value.length <= MAX_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_STRING_LENGTH)}${TRUNCATED_MARKER}`;
}

function sanitizeObjectLike(value: object, depth: number, seen: WeakSet<object>): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '[InvalidDate]' : value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length}]`;
  }
  if (value instanceof Error) {
    return sanitizeError(value, depth, seen);
  }
  if (depth >= MAX_DEPTH) {
    return TRUNCATED_MARKER;
  }
  if (seen.has(value)) {
    return CIRCULAR_MARKER;
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return sanitizeArray(value, depth, seen);
    }
    if (value instanceof Map) {
      return sanitizeEntries([...value.entries()], depth, seen);
    }
    if (value instanceof Set) {
      return sanitizeArray([...value], depth, seen);
    }
    return sanitizeRecord(value as Record<string, unknown>, depth, seen);
  } catch {
    // A throwing iterator, proxy trap or exotic object collapses to a marker
    // rather than taking the logger down with it.
    return UNREADABLE_MARKER;
  } finally {
    seen.delete(value);
  }
}

function sanitizeArray(value: readonly unknown[], depth: number, seen: WeakSet<object>): unknown[] {
  const bounded = value.slice(0, MAX_ARRAY_ITEMS).map((item) => {
    const sanitized = sanitizeValue(item, depth + 1, seen);
    // An array preserves position, so a dropped element becomes null rather than
    // silently shifting every later index.
    return sanitized === undefined ? null : sanitized;
  });
  if (value.length > MAX_ARRAY_ITEMS) {
    bounded.push(`${TRUNCATED_MARKER} (${value.length - MAX_ARRAY_ITEMS} more)`);
  }
  return bounded;
}

function sanitizeEntries(
  entries: readonly (readonly [unknown, unknown])[],
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, val] of entries.slice(0, MAX_OBJECT_KEYS)) {
    assignSanitized(record, String(key), val, depth, seen);
  }
  return record;
}

function sanitizeRecord(
  value: Record<string, unknown>,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  const keys = Object.keys(value).slice(0, MAX_OBJECT_KEYS);
  for (const key of keys) {
    let raw: unknown;
    try {
      raw = value[key];
    } catch {
      // A getter that throws must not abort the whole record.
      record[key] = UNREADABLE_MARKER;
      continue;
    }
    assignSanitized(record, key, raw, depth, seen);
  }
  return record;
}

function assignSanitized(
  target: Record<string, unknown>,
  key: string,
  raw: unknown,
  depth: number,
  seen: WeakSet<object>,
): void {
  if (isSensitiveKey(key)) {
    target[key] = REDACTED_MARKER;
    return;
  }
  const sanitized = sanitizeValue(raw, depth + 1, seen);
  if (sanitized !== undefined) {
    target[key] = sanitized;
  }
}

/** A nested `Error` is summarised the same way as a top-level one, with cause. */
function sanitizeError(
  error: Error,
  depth: number,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {
    name: error.name,
    message: truncateString(redactString(error.message)),
  };
  const { cause } = error;
  if (cause !== undefined && depth < MAX_DEPTH) {
    const sanitizedCause = sanitizeValue(cause, depth + 1, seen);
    if (sanitizedCause !== undefined) {
      summary['cause'] = sanitizedCause;
    }
  }
  return summary;
}

/**
 * Sanitises a caller-provided attribute bag, dropping any reserved top-level key
 * so caller data can never impersonate a platform field.
 */
export function sanitizeAttributes(
  fields: Record<string, unknown> | undefined,
  reserved: ReadonlySet<string>,
): Record<string, unknown> | undefined {
  if (fields === undefined) {
    return undefined;
  }
  const record: Record<string, unknown> = {};
  for (const key of Object.keys(fields).slice(0, MAX_OBJECT_KEYS)) {
    if (reserved.has(key)) {
      continue;
    }
    assignSanitized(record, key, safeRead(fields, key), 0, new WeakSet());
  }
  return Object.keys(record).length > 0 ? record : undefined;
}

function safeRead(source: Record<string, unknown>, key: string): unknown {
  try {
    return source[key];
  } catch {
    return UNREADABLE_MARKER;
  }
}
