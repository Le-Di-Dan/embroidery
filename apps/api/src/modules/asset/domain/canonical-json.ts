/**
 * Canonical JSON hashing for the two intake fingerprints (`ADR-APP2-001` §4.2f-1).
 *
 * A fingerprint is only useful if two runs over the same facts produce the same
 * bytes, so the encoding is pinned here rather than left to `JSON.stringify`'s
 * insertion order:
 *
 *   - object keys sorted lexicographically by UTF-16 code unit;
 *   - no insignificant whitespace;
 *   - UTF-8 bytes;
 *   - SHA-256, lowercase hex, `sha256:` prefix.
 *
 * **Never canonicalise a value read back out of PostgreSQL `jsonb`.** `jsonb`
 * normalises object key order on write, so a stored result is a different
 * document from the one that was authored — the gate measured exactly that.
 * Both fingerprints are therefore hashed here, from in-memory facts, before
 * anything is stored, and are never recomputed from a database round-trip.
 */
import { createHash } from 'node:crypto';

/** A JSON value this module is willing to canonicalise. */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/** The prefix every hash in the asset-intake contract carries. */
export const SHA256_PREFIX = 'sha256:';

/** `sha256:` followed by exactly 64 lowercase hex characters. */
export const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * Serialises a value with sorted object keys.
 *
 * Numbers are restricted to finite integers: a float would reintroduce
 * platform-dependent formatting, and every number in the intake contract
 * (`version`, `byteSize`) is an integer by construction.
 */
export function canonicalize(value: CanonicalValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new TypeError('Canonical JSON accepts only integer numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  const entries = Object.entries(value as { readonly [key: string]: CanonicalValue })
    .filter((entry): entry is [string, CanonicalValue] => entry[1] !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
}

/** Hashes a UTF-8 string to the prefixed lowercase-hex form. */
export function sha256Hex(input: string): string {
  return `${SHA256_PREFIX}${createHash('sha256').update(input, 'utf8').digest('hex')}`;
}

/** Canonicalises then hashes — the only way a fingerprint is produced. */
export function fingerprintOf(value: CanonicalValue): string {
  return sha256Hex(canonicalize(value));
}
