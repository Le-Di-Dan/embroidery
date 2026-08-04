/**
 * Server-only hashing. **The only file in this package that touches Node.**
 *
 * It is a separate export subpath, not a flag, because APP0-R01 measured the
 * reason: `crypto.subtle` exists only in a secure context, so on a plain-HTTP
 * origin a browser-side implementation is `undefined` and a Web-Crypto-only
 * hash throws. The accepted conclusion was that canonical hashing stays
 * server-side. A subpath makes that a build-time fact — importing the package
 * root into a Storefront bundle cannot drag `node:crypto` in behind it — where a
 * runtime branch would merely be a convention waiting to be broken.
 *
 * No pure-JS browser fallback is provided here on purpose. A second
 * implementation is a second thing that can disagree with the first about a
 * value an approval is bound to.
 */
import { createHash } from 'node:crypto';

import { canonicalizeDesignDocumentToBytes } from '../canonical/canonicalize';
import type { DesignDocument } from '../schema/document';

/** Lowercase hex SHA-256 over canonical UTF-8 bytes (ADR-DB1-012 §8). */
export function hashCanonicalDesignDocumentBytesSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Hashes a validated, quantized document.
 *
 * Always through canonical bytes — never `JSON.stringify`, whose key order
 * follows insertion order and would give two identical designs two different
 * hashes depending on which field the editor happened to set first.
 */
export function hashDesignDocumentSha256(document: DesignDocument): string {
  return hashCanonicalDesignDocumentBytesSha256(canonicalizeDesignDocumentToBytes(document));
}

/** `sha256:<64 hex>`, the storage form used by `*_hash` columns (ADR-DB1-006). */
export function formatDesignDocumentHash(hex: string): string {
  return `sha256:${hex}`;
}
