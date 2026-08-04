/**
 * RFC 8785 JSON Canonicalization Scheme, over the JSON domain this schema
 * accepts.
 *
 * Written here rather than pulled in, for the reason ADR-DB1-012 gives: the
 * hash is the integrity link between a design version, its approval and the
 * artifact that gets produced, so its input must be a *specified* form rather
 * than one library's incidental behaviour. Three details carry that:
 *
 * - **Key order** is by UTF-16 code unit. JavaScript's default string
 *   comparison is exactly that, so `sort()` is correct and `localeCompare` —
 *   which would reorder keys differently under a Vietnamese locale — is a bug.
 * - **Numbers** use ECMAScript `Number::toString`, which JCS §3.2.2.3 adopts by
 *   reference. `String(n)` is that algorithm.
 * - **Strings** use JSON escaping, which since well-formed `JSON.stringify`
 *   (ES2019) emits the shortest escape for control characters and `\uXXXX` for
 *   lone surrogates — exactly what JCS §3.2.2.2 requires.
 *
 * Nothing here normalizes Unicode. JCS does not, and ADR-DB1-012 §7 puts NFC at
 * the *input boundary* instead, so validation rejects non-NFC text before a
 * document ever reaches this file.
 */

export class DesignDocumentCanonicalizationError extends Error {}

/**
 * `undefined` disappears rather than becoming `null`.
 *
 * ADR-DB1-012 §7 is explicit that an omitted field is omitted entirely, so a
 * missing optional and an explicit null stay distinguishable — and hash
 * differently, which is the point.
 */
function encode(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number': {
      if (!Number.isFinite(value)) {
        throw new DesignDocumentCanonicalizationError(
          `The value at ${path} is not a finite number and cannot be canonicalized.`,
        );
      }
      // `String(-0)` is "0", which is what JCS requires; quantization has
      // already normalized it so the in-memory value matches the bytes too.
      return String(value);
    }
    case 'string':
      return JSON.stringify(value);
    case 'bigint':
    case 'function':
    case 'symbol':
      throw new DesignDocumentCanonicalizationError(
        `The value at ${path} is a ${typeof value} and is not JSON data.`,
      );
    default:
      break;
  }

  if (Array.isArray(value)) {
    // Array order is semantic (z-order). JCS does not reorder arrays, and an
    // `undefined` slot would change length, so it becomes `null` as JSON does.
    const items = value.map((item, index) => encode(item, `${path}[${String(index)}]`) ?? 'null');
    return `[${items.join(',')}]`;
  }

  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new DesignDocumentCanonicalizationError(
      `The value at ${path} is a class instance, DOM node or renderer node, not plain data.`,
    );
  }

  const source = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(source).sort()) {
    const encoded = encode(source[key], `${path}.${key}`);
    if (encoded !== undefined) parts.push(`${JSON.stringify(key)}:${encoded}`);
  }
  return `{${parts.join(',')}}`;
}

/** Canonical JSON text for any value inside the accepted JSON domain. */
export function canonicalizeJson(value: unknown): string {
  const encoded = encode(value, '$');
  if (encoded === undefined) {
    throw new DesignDocumentCanonicalizationError('There is nothing to canonicalize.');
  }
  return encoded;
}

/** UTF-8 bytes of the canonical form — what a hash is actually taken over. */
export function canonicalJsonToBytes(canonical: string): Uint8Array {
  return new TextEncoder().encode(canonical);
}
