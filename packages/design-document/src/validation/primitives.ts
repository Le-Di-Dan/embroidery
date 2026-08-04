/**
 * The narrow value checks every validation layer shares.
 *
 * There is no coercion anywhere in this file, and that is the point: `"12"` is
 * not `12`, a missing `schemaVersion` is not `1`, and an unknown element type is
 * not "close enough" to a shape. Coercion is how an untrusted payload quietly
 * becomes a document that no longer means what its author sent, and a hash over
 * a coerced document is a hash of something nobody wrote.
 */
import { finding, type DesignDocumentFinding } from '../findings/finding';

/** A collector so a caller sees every problem at once, not the first one. */
export class FindingCollector {
  private readonly items: DesignDocumentFinding[] = [];

  add(item: DesignDocumentFinding): void {
    this.items.push(item);
  }

  invalid(path: string, message: string): void {
    this.items.push(finding('INVALID_DOCUMENT', path, message));
  }

  get findings(): readonly DesignDocumentFinding[] {
    return this.items;
  }

  get empty(): boolean {
    return this.items.length === 0;
  }
}

/** A plain JSON object: not null, not an array, not a class or DOM instance. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Unicode NFC, checked at the input boundary (ADR-DB1-012 §7).
 *
 * JCS does not normalize, so `"ệ"` composed and `"ệ"` decomposed canonicalize to
 * different bytes and therefore different hashes — the same Vietnamese word
 * typed on two devices would not match. The ADR puts the fix here, on ingest,
 * and rejects rather than silently rewrites: quietly changing a customer's text
 * is still changing it.
 */
export function isNfc(value: string): boolean {
  return value.normalize('NFC') === value;
}

export function requireNfc(value: string, path: string, collector: FindingCollector): boolean {
  if (isNfc(value)) return true;
  collector.invalid(path, 'Text must be Unicode NFC normalized.');
  return false;
}

/** Reads a finite number, recording a finding when it is absent or non-finite. */
export function requireFinite(
  source: Record<string, unknown>,
  key: string,
  path: string,
  collector: FindingCollector,
): number | undefined {
  const value = source[key];
  if (!isFiniteNumber(value)) {
    collector.invalid(`${path}.${key}`, `"${key}" must be a finite number.`);
    return undefined;
  }
  return value;
}

export function requirePositive(
  source: Record<string, unknown>,
  key: string,
  path: string,
  collector: FindingCollector,
): number | undefined {
  const value = requireFinite(source, key, path, collector);
  if (value === undefined) return undefined;
  if (value <= 0) {
    collector.invalid(`${path}.${key}`, `"${key}" must be greater than zero.`);
    return undefined;
  }
  return value;
}

export function requirePositiveInteger(
  source: Record<string, unknown>,
  key: string,
  path: string,
  collector: FindingCollector,
): number | undefined {
  const value = requirePositive(source, key, path, collector);
  if (value === undefined) return undefined;
  if (!Number.isInteger(value)) {
    collector.invalid(`${path}.${key}`, `"${key}" must be a whole number of pixels.`);
    return undefined;
  }
  return value;
}

export function requireString(
  source: Record<string, unknown>,
  key: string,
  path: string,
  collector: FindingCollector,
): string | undefined {
  const value = source[key];
  if (!isNonEmptyString(value)) {
    collector.invalid(`${path}.${key}`, `"${key}" must be a non-empty string.`);
    return undefined;
  }
  return requireNfc(value, `${path}.${key}`, collector) ? value : undefined;
}

export function requireBoolean(
  source: Record<string, unknown>,
  key: string,
  path: string,
  collector: FindingCollector,
): boolean | undefined {
  const value = source[key];
  if (typeof value !== 'boolean') {
    collector.invalid(`${path}.${key}`, `"${key}" must be a boolean.`);
    return undefined;
  }
  return value;
}

export function requireEnum<T extends string>(
  source: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  path: string,
  collector: FindingCollector,
): T | undefined {
  const value = source[key];
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    collector.invalid(`${path}.${key}`, `"${key}" must be one of: ${allowed.join(', ')}.`);
    return undefined;
  }
  return value as T;
}

/**
 * Rejects any key the schema does not define.
 *
 * Unknown fields are not harmless passengers. They change canonical bytes, so
 * they change the hash an approval is bound to, and anything that survives one
 * release unvalidated tends to be read by the next one.
 */
export function rejectUnknownKeys(
  source: Record<string, unknown>,
  known: readonly string[],
  path: string,
  collector: FindingCollector,
): void {
  for (const key of Object.keys(source)) {
    if (!known.includes(key)) {
      collector.invalid(`${path}.${key}`, `Unknown field "${key}" is not part of this schema.`);
    }
  }
}
