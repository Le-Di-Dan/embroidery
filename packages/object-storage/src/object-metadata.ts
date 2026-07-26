/**
 * Bounded user-metadata rules for provider objects (ADR-APP2-001 §4.5).
 *
 * Provider metadata is a small, non-authoritative convenience copy. The
 * database owns every persisted fact (checksum, size, MIME, lifecycle), so
 * nothing here may grow unbounded or carry personal data — an S3-compatible
 * store also rejects non-ASCII header values, which would otherwise surface as
 * an opaque signature failure mid-upload rather than a clear rejection.
 */
import { ObjectMetadataError } from './object-storage.errors';

export const MAX_METADATA_ENTRIES = 10;
export const MAX_METADATA_KEY_LENGTH = 64;
export const MAX_METADATA_VALUE_LENGTH = 256;

/** Lowercase because providers normalise metadata keys; matching avoids surprises. */
const METADATA_KEY_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const PRINTABLE_ASCII_MIN = 0x20;
const PRINTABLE_ASCII_MAX = 0x7e;

function reject(message: string): never {
  throw new ObjectMetadataError(`Invalid object metadata: ${message}`);
}

function isPrintableAscii(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    if (codePoint < PRINTABLE_ASCII_MIN || codePoint > PRINTABLE_ASCII_MAX) {
      return false;
    }
  }
  return true;
}

export function assertBoundedMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): Record<string, string> | undefined {
  if (metadata === undefined) {
    return undefined;
  }
  const entries = Object.entries(metadata);
  if (entries.length > MAX_METADATA_ENTRIES) {
    reject(`at most ${String(MAX_METADATA_ENTRIES)} entries are permitted.`);
  }
  const validated: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.length > MAX_METADATA_KEY_LENGTH || !METADATA_KEY_PATTERN.test(key)) {
      reject(
        `key "${key}" must be 1-${String(MAX_METADATA_KEY_LENGTH)} lowercase [a-z0-9-] characters.`,
      );
    }
    if (value.length > MAX_METADATA_VALUE_LENGTH || !isPrintableAscii(value)) {
      reject(
        `value for "${key}" must be at most ${String(MAX_METADATA_VALUE_LENGTH)} printable ASCII characters.`,
      );
    }
    validated[key] = value;
  }
  return validated;
}

/** Providers return metadata as a loose record; normalise it to a safe shape. */
export function readMetadata(raw: Record<string, string> | undefined): Record<string, string> {
  if (raw === undefined) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      result[key.toLowerCase()] = value;
    }
  }
  return result;
}
