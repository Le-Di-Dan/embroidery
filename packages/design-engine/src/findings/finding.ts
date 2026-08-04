/**
 * Typed geometry findings.
 *
 * Same shape and same discipline as the Design Document's findings: a stable
 * machine `code`, a bounded path or element id, a message written to be shown,
 * and optional **numeric** metadata. Numbers only — an object slot invites
 * "just the offending value", which is exactly the untrusted content that must
 * not cross this boundary.
 *
 * The codes are geometry-level. P01's structural codes are not duplicated;
 * the two exceptions are `INVALID_GEOMETRY` and `UNKNOWN_ELEMENT`, which exist
 * because the engine can be called directly with input P01 never validated and
 * must still fail safely rather than throw.
 */

export type GeometryFindingCode =
  | 'INVALID_GEOMETRY'
  | 'SINGULAR_TRANSFORM'
  | 'UNKNOWN_ELEMENT'
  | 'INVALID_PARENT_CHAIN'
  | 'PLACEMENT_SIDE_MISMATCH'
  | 'PLACEMENT_AREA_MISMATCH'
  | 'PLACEMENT_AUTHORITY_MISMATCH'
  | 'PLACEMENT_RETIRED'
  | 'PX_PER_MM_MISMATCH'
  | 'ELEMENT_OUT_OF_BOUNDS'
  | 'ELEMENT_PHYSICAL_SIZE_EXCEEDED';

/** Safe numeric metadata. Deliberately not `unknown` and not strings. */
export type GeometryFindingMetadata = Readonly<Record<string, number>>;

export interface GeometryFinding {
  readonly code: GeometryFindingCode;
  /** Bounded JSON path, e.g. `$.elements[3]`. Never the value at it. */
  readonly path: string;
  /** The element the finding is about, when there is one. */
  readonly elementId?: string;
  readonly message: string;
  readonly meta?: GeometryFindingMetadata;
}

export interface GeometryValidationResult {
  readonly ok: boolean;
  readonly findings: readonly GeometryFinding[];
}

const MAX_PATH_LENGTH = 200;
const MAX_ID_LENGTH = 128;

function bounded(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

export function geometryFinding(
  code: GeometryFindingCode,
  path: string,
  message: string,
  options: { readonly elementId?: string; readonly meta?: GeometryFindingMetadata } = {},
): GeometryFinding {
  const finding: {
    code: GeometryFindingCode;
    path: string;
    message: string;
    elementId?: string;
    meta?: GeometryFindingMetadata;
  } = { code, path: bounded(path, MAX_PATH_LENGTH), message };
  if (options.elementId !== undefined)
    finding.elementId = bounded(options.elementId, MAX_ID_LENGTH);
  if (options.meta !== undefined) finding.meta = options.meta;
  return finding;
}

export function geometryResult(findings: readonly GeometryFinding[]): GeometryValidationResult {
  return { ok: findings.length === 0, findings };
}
