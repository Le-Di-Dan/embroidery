/**
 * Typed validation findings.
 *
 * A finding is what crosses a trust boundary, so its shape is a security
 * decision as much as an ergonomic one. It carries a stable machine `code`, a
 * bounded JSON path and a message written to be shown — never the raw document,
 * a storage key, a private URL, a session secret, font bytes or a stack trace.
 * The `meta` map is restricted to scalars for the same reason: an object slot
 * is an invitation to attach "just the offending value", which is exactly the
 * untrusted data that must not travel.
 */

/** Stable machine codes. Consumers switch on these; never on message text. */
export type DesignDocumentFindingCode =
  | 'INVALID_DOCUMENT'
  | 'UNSUPPORTED_SCHEMA_VERSION'
  | 'COMPLEXITY_LIMIT_EXCEEDED'
  | 'DUPLICATE_ELEMENT_ID'
  | 'INVALID_GROUP_REFERENCE'
  | 'MULTIPLE_GROUP_PARENTS'
  | 'GROUP_CYCLE'
  | 'UNKNOWN_FONT_ID'
  | 'UNSUPPORTED_FONT_VARIANT'
  | 'UNKNOWN_ASSET_REFERENCE'
  | 'INELIGIBLE_DERIVATIVE'
  | 'DERIVATIVE_METADATA_MISMATCH'
  | 'DECODED_PIXEL_LIMIT_EXCEEDED'
  | 'CANONICALIZATION_FAILED';

/** Safe scalar metadata. Deliberately not `unknown`. */
export type FindingMetadata = Readonly<Record<string, string | number | boolean>>;

export interface DesignDocumentFinding {
  readonly code: DesignDocumentFindingCode;
  /** Bounded JSON path, e.g. `$.elements[3].transform.x`. Never the value at it. */
  readonly path: string;
  readonly message: string;
  readonly meta?: FindingMetadata;
}

/** A successful parse yields the value; a failed one yields findings, never both. */
export type DesignDocumentResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly findings: readonly DesignDocumentFinding[] };

/** Longest path a finding may carry, so a deep document cannot inflate output. */
const MAX_PATH_LENGTH = 200;

export function boundedPath(path: string): string {
  return path.length <= MAX_PATH_LENGTH ? path : `${path.slice(0, MAX_PATH_LENGTH - 1)}…`;
}

export function finding(
  code: DesignDocumentFindingCode,
  path: string,
  message: string,
  meta?: FindingMetadata,
): DesignDocumentFinding {
  return meta === undefined
    ? { code, path: boundedPath(path), message }
    : { code, path: boundedPath(path), message, meta };
}

export function ok<T>(value: T): DesignDocumentResult<T> {
  return { ok: true, value };
}

export function failed<T>(findings: readonly DesignDocumentFinding[]): DesignDocumentResult<T> {
  return { ok: false, findings };
}
