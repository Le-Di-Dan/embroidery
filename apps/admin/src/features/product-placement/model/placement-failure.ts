/**
 * Classification of a placement API failure.
 *
 * The domain code is the only authority. `409` alone is not a version conflict:
 * `adminProductPlacement_replace` also answers `409` for a referenced-immutable
 * row and for an ineligible background asset. The conflict dialog is
 * destructive advice — it offers to reload, which replaces the operator's
 * unsaved placement tree — so it may only open for the exact code that reloading
 * actually fixes. A `409` without that code is an ordinary failure.
 *
 * Nothing here reads the server's message, request id or field details for
 * display. Every operator-facing string is chosen from `PLACEMENT_COPY` by the
 * classification alone.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

/** The B01 domain code for a stale `expectedUpdatedAt`. */
export const PLACEMENT_VERSION_CONFLICT_CODE = 'PLACEMENT_VERSION_CONFLICT';
/** The row is referenced by a Template or live Session and is frozen (`409`). */
export const PLACEMENT_REFERENCED_IMMUTABLE_CODE = 'PLACEMENT_REFERENCED_IMMUTABLE';

const HTTP_NOT_FOUND = 404;

/** Server-side geometry refusals, all `400`. */
const GEOMETRY_CODES = new Set([
  'PLACEMENT_GEOMETRY_INVALID',
  'PLACEMENT_SCALE_INCONSISTENT',
  'PLACEMENT_AREA_OUTSIDE_CANVAS',
]);

/** Background-asset refusals, split across `400` and `409`. */
const BACKGROUND_CODES = new Set([
  'PLACEMENT_BACKGROUND_NOT_FOUND',
  'PLACEMENT_BACKGROUND_NOT_ELIGIBLE',
]);

/** Request-shape refusals the operator can fix by editing a field. */
const INVALID_CODES = new Set([
  'PLACEMENT_INVALID',
  'PLACEMENT_CODE_DUPLICATE',
  'PLACEMENT_ROW_NOT_IN_PARENT',
  'PLACEMENT_REPLACEMENT_INVALID',
]);

export class PlacementApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin placement API call failed.');
    this.name = 'PlacementApiError';
    this.normalized = normalized;
  }
}

export function isPlacementApiError(error: unknown): error is PlacementApiError {
  return error instanceof PlacementApiError;
}

/**
 * What the operator is actually facing.
 *
 * `generic` is the safe default for everything else — an unrecognised code, a
 * bare status, a transport failure. It never claims to know more than it does.
 */
export type PlacementSaveFailure =
  'version-conflict' | 'referenced-immutable' | 'geometry' | 'background' | 'invalid' | 'generic';

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isPlacementApiError(error) ? error.normalized : null;
}

export function classifySaveFailure(error: unknown): PlacementSaveFailure {
  const code = normalizedOf(error)?.code;
  if (code === undefined) return 'generic';
  if (code === PLACEMENT_VERSION_CONFLICT_CODE) return 'version-conflict';
  if (code === PLACEMENT_REFERENCED_IMMUTABLE_CODE) return 'referenced-immutable';
  if (GEOMETRY_CODES.has(code)) return 'geometry';
  if (BACKGROUND_CODES.has(code)) return 'background';
  if (INVALID_CODES.has(code)) return 'invalid';
  return 'generic';
}

/**
 * True only for the exact version conflict.
 *
 * The single gate on the reload dialog, so it is deliberately the narrowest
 * possible test.
 */
export function isVersionConflict(error: unknown): boolean {
  return classifySaveFailure(error) === 'version-conflict';
}

/** True when the requested product does not exist for this operator. */
export function isNotFound(error: unknown): boolean {
  return normalizedOf(error)?.httpStatus === HTTP_NOT_FOUND;
}

/**
 * What a failed Side-background fetch means for the preview (`APP3-B02A`).
 *
 * Separate from `PlacementSaveFailure` because the consequences are different: a
 * save failure is about the operator's unsaved work, while this one is about a
 * picture. Neither may ever be presented as the other — a background that cannot
 * be fetched must not look like a placement that cannot be saved.
 *
 * `unavailable` and `retryable` are deliberately distinct. `404` means the
 * server will not resolve a background at this address at all — retrying changes
 * nothing, and offering a retry would invite the operator to keep clicking. A
 * `503` or a transport failure is the opposite: the row says the background
 * exists, so trying again is exactly the right advice.
 */
export type BackgroundFailure = 'unavailable' | 'retryable';

const HTTP_SERVICE_UNAVAILABLE = 503;

export function classifyBackgroundFailure(error: unknown): BackgroundFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'retryable';

  // A malformed pair is a client bug the operator cannot act on, and the server
  // will keep refusing it — so it is reported as unavailable, not retryable.
  if (
    normalized.httpStatus === HTTP_NOT_FOUND ||
    normalized.code === 'ADMIN_SIDE_BACKGROUND_NOT_FOUND' ||
    normalized.code === 'ADMIN_SIDE_BACKGROUND_INVALID'
  ) {
    return 'unavailable';
  }
  if (
    normalized.httpStatus === HTTP_SERVICE_UNAVAILABLE ||
    normalized.code === 'ADMIN_SIDE_BACKGROUND_UNAVAILABLE'
  ) {
    return 'retryable';
  }
  // Everything else — including a session failure, which the shared Admin auth
  // handling reacts to on its own — is retryable here. The preview never
  // interprets an auth outcome itself.
  return 'retryable';
}
