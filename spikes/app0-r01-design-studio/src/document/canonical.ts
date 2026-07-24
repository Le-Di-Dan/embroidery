/**
 * Spike-level canonicalization + hashing, following the direction locked by
 * ADR-DB1-012 (RFC 8785 JCS + SHA-256). The production implementation belongs
 * to `packages/design-document`; this is the smallest faithful subset needed to
 * prove that two different rendering engines produce the *same* canonical bytes
 * for the same semantic document.
 *
 * Subset implemented here: lexicographic key ordering by UTF-16 code unit,
 * ECMAScript `Number::toString` serialization, omission of `undefined`,
 * preserved array order, NFC string normalization, rejection of non-finite
 * numbers and of any non-JSON value (function, symbol, DOM node, class
 * instance). Full RFC 8785 conformance vectors are deferred to the owning
 * package.
 */

import { sha256Hex } from './sha256';

/** Transform accumulation produces float noise; the document is quantized. */
const NUMERIC_SCALE = 10_000;

export class CanonicalizationError extends Error {}

function quantize(value: number): number {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(
      `Non-finite number is not JSON-interoperable: ${String(value)}`,
    );
  }
  const rounded = Math.round(value * NUMERIC_SCALE) / NUMERIC_SCALE;
  // JCS/ECMAScript serialize -0 as "0"; normalize so hashes cannot diverge.
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalValue(value: unknown, path: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      return String(quantize(value));
    case 'string':
      return JSON.stringify(value.normalize('NFC'));
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new CanonicalizationError(`Value at ${path} is not serializable: ${typeof value}`);
    default:
      break;
  }
  if (Array.isArray(value)) {
    const items = value.map((item, index) => canonicalValue(item, `${path}[${index}]`) ?? 'null');
    return `[${items.join(',')}]`;
  }
  if (!isPlainObject(value)) {
    throw new CanonicalizationError(
      `Value at ${path} is a non-plain object (engine node, DOM node or class instance).`,
    );
  }
  const parts: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const encoded = canonicalValue(value[key], `${path}.${key}`);
    if (encoded !== undefined) {
      parts.push(`${JSON.stringify(key.normalize('NFC'))}:${encoded}`);
    }
  }
  return `{${parts.join(',')}}`;
}

/** Deterministic canonical JSON text for the given document payload. */
export function canonicalize(document: unknown): string {
  const encoded = canonicalValue(document, '$');
  if (encoded === undefined) {
    throw new CanonicalizationError('Document is undefined.');
  }
  return encoded;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Which digest implementation the last `documentHash` call used. */
export let lastHashSource: 'web-crypto' | 'pure-js' = 'web-crypto';

/**
 * `sha256:<hex>` over the UTF-8 bytes of the canonical form (ADR-DB1-012 §10).
 *
 * `crypto.subtle` is only defined in a **secure context** (https or localhost).
 * On a plain-HTTP origin it is `undefined`, so a Web-Crypto-only implementation
 * would throw. The pure-JS fallback keeps the same bytes and the same digest,
 * and both paths are asserted to agree in the Node tests.
 */
export async function documentHash(document: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(document));
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    lastHashSource = 'pure-js';
    return `sha256:${sha256Hex(bytes)}`;
  }
  lastHashSource = 'web-crypto';
  return `sha256:${toHex(await subtle.digest('SHA-256', bytes))}`;
}
