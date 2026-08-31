/**
 * The only error type the gallery-editor services throw, and how it is read.
 *
 * It carries the normalized envelope error and nothing else, so no Axios
 * instance, request config or raw server message can travel with it into React
 * state. Every operator-facing string is chosen by the classification alone —
 * the server `message` and `requestId` are never read for display, and the
 * `code` is compared against a closed set, never rendered.
 *
 * ## The domain code is the authority, not the status
 *
 * HTTP `409` alone is never a version conflict. The gallery authoring contract
 * answers `409` for four different things — a taken address, a stale token, an
 * entry that is not ready to publish, and a transition its state does not allow
 * — and only one of them is repaired by reloading. The stale-token dialog is
 * destructive advice: it tells the operator to reload, which discards their
 * unsaved work, and offering it for a refusal reloading cannot fix would send
 * them around a loop that never terminates. So a `409` without the exact code
 * is an ordinary failure here, not a conflict.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;

export class GalleryEditorApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin gallery editor API call failed.');
    this.name = 'GalleryEditorApiError';
    this.normalized = normalized;
  }
}

export function isGalleryEditorApiError(error: unknown): error is GalleryEditorApiError {
  return error instanceof GalleryEditorApiError;
}

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isGalleryEditorApiError(error) ? error.normalized : null;
}

// --- The closed set of domain codes this feature reacts to -------------------
//
// Each one exists because the screen does something different for it. A code
// the server may send that is not listed here is deliberately absent: it lands
// in the generic band rather than acquiring a message this checkpoint invented.

/** A stale `expectedUpdatedAt` on a guarded write. The only reload case. */
export const GALLERY_ENTRY_VERSION_CONFLICT = 'GALLERY_ENTRY_VERSION_CONFLICT';
/** The chosen public address is already taken. Create-time only. */
export const GALLERY_ENTRY_SLUG_CONFLICT = 'GALLERY_ENTRY_SLUG_CONFLICT';
/** Publication refused because persisted state is incomplete. */
export const GALLERY_ENTRY_PUBLICATION_NOT_READY = 'GALLERY_ENTRY_PUBLICATION_NOT_READY';
const GALLERY_ENTRY_PUBLISH_NOT_ALLOWED = 'GALLERY_ENTRY_PUBLISH_NOT_ALLOWED';
const GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED = 'GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED';
const GALLERY_ENTRY_ASSET_NOT_ELIGIBLE = 'GALLERY_ENTRY_ASSET_NOT_ELIGIBLE';
const GALLERY_ENTRY_ASSET_DUPLICATE = 'GALLERY_ENTRY_ASSET_DUPLICATE';
const GALLERY_ENTRY_LINKED_PRODUCT_INVALID = 'GALLERY_ENTRY_LINKED_PRODUCT_INVALID';
/** The prepared copy's source moved on since it was listed. */
const GALLERY_ASSET_SOURCE_VERSION_CONFLICT = 'GALLERY_ASSET_SOURCE_VERSION_CONFLICT';

/** True only for the exact guarded-write conflict — the narrowest possible test. */
export function isVersionConflict(error: unknown): boolean {
  return normalizedOf(error)?.code === GALLERY_ENTRY_VERSION_CONFLICT;
}

/** True when the entry does not exist for this operator. */
export function isNotFound(error: unknown): boolean {
  return normalizedOf(error)?.httpStatus === HTTP_NOT_FOUND;
}

export function isUnauthenticated(error: unknown): boolean {
  return normalizedOf(error)?.httpStatus === HTTP_UNAUTHORIZED;
}

// --- Per-operation classifications -------------------------------------------

/** Why an entry could not be read. */
export type GalleryDetailFailure = 'unauthenticated' | 'not-found' | 'unavailable';

export function classifyDetailFailure(error: unknown): GalleryDetailFailure {
  if (isUnauthenticated(error)) return 'unauthenticated';
  if (isNotFound(error)) return 'not-found';
  return 'unavailable';
}

/** Why a create was refused. */
export type GalleryCreateFailure = 'slugConflict' | 'invalid' | 'unauthenticated' | 'generic';

export function classifyCreateFailure(error: unknown): GalleryCreateFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  if (normalized.httpStatus === HTTP_UNAUTHORIZED) return 'unauthenticated';
  if (normalized.code === GALLERY_ENTRY_SLUG_CONFLICT) return 'slugConflict';
  // A rejected linked product and a schema rejection are both "fix the form".
  if (normalized.code === GALLERY_ENTRY_LINKED_PRODUCT_INVALID) return 'invalid';
  return normalized.httpStatus === 400 || normalized.httpStatus === 422 ? 'invalid' : 'generic';
}

/** Why an authoring save was refused. Version conflict is handled separately. */
export type GalleryAuthoringFailure = 'invalid' | 'notFound' | 'unauthenticated' | 'generic';

export function classifyAuthoringFailure(error: unknown): GalleryAuthoringFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  if (normalized.httpStatus === HTTP_UNAUTHORIZED) return 'unauthenticated';
  if (normalized.httpStatus === HTTP_NOT_FOUND) return 'notFound';
  if (normalized.code === GALLERY_ENTRY_LINKED_PRODUCT_INVALID) return 'invalid';
  return normalized.httpStatus === 400 || normalized.httpStatus === 422 ? 'invalid' : 'generic';
}

/** Why a media replacement was refused. Version conflict is handled separately. */
export type GalleryMediaSaveFailure =
  'notEligible' | 'duplicate' | 'notFound' | 'unauthenticated' | 'generic';

export function classifyMediaSaveFailure(error: unknown): GalleryMediaSaveFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  if (normalized.httpStatus === HTTP_UNAUTHORIZED) return 'unauthenticated';
  switch (normalized.code) {
    case GALLERY_ENTRY_ASSET_NOT_ELIGIBLE:
      return 'notEligible';
    case GALLERY_ENTRY_ASSET_DUPLICATE:
      return 'duplicate';
    default:
      return normalized.httpStatus === HTTP_NOT_FOUND ? 'notFound' : 'generic';
  }
}

/** Why a publish or unpublish was refused. Version conflict is handled separately. */
export type GalleryPublicationFailure =
  'notReady' | 'notAllowed' | 'notFound' | 'unauthenticated' | 'generic';

export function classifyPublicationFailure(error: unknown): GalleryPublicationFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  if (normalized.httpStatus === HTTP_UNAUTHORIZED) return 'unauthenticated';
  switch (normalized.code) {
    case GALLERY_ENTRY_PUBLICATION_NOT_READY:
      return 'notReady';
    case GALLERY_ENTRY_PUBLISH_NOT_ALLOWED:
    case GALLERY_ENTRY_UNPUBLISH_NOT_ALLOWED:
      return 'notAllowed';
    default:
      return normalized.httpStatus === HTTP_NOT_FOUND ? 'notFound' : 'generic';
  }
}

/**
 * Why a gallery image could not be prepared from a catalog source.
 *
 * `staleSource` is the one band with a mandated recovery and no automatic
 * retry: the source moved on, so re-sending the same token could only fail
 * again, and the operator has to re-read the list and choose again.
 *
 * The eligibility band is deliberately one band and not four. The server
 * reports an unknown id, a customer's private upload, an already-public asset
 * and one whose renditions are not ready identically — telling them apart is
 * how an endpoint confirms that a customer's private artwork exists — so the
 * screen cannot tell them apart either, and does not pretend to.
 */
export type GalleryPrepareFailure =
  'staleSource' | 'notEligible' | 'unavailable' | 'unauthenticated' | 'generic';

export function classifyPrepareFailure(error: unknown): GalleryPrepareFailure {
  const normalized = normalizedOf(error);
  if (normalized === null) return 'generic';
  if (normalized.httpStatus === HTTP_UNAUTHORIZED) return 'unauthenticated';
  if (normalized.code === GALLERY_ASSET_SOURCE_VERSION_CONFLICT) return 'staleSource';
  if (normalized.httpStatus === HTTP_NOT_FOUND) return 'notEligible';
  // The platform replaces every 5xx code with the generic one, so the status is
  // the only part of a storage outage a client can act on — and it is enough:
  // nothing was created, and a later attempt may succeed.
  return normalized.httpStatus === HTTP_SERVICE_UNAVAILABLE ? 'unavailable' : 'generic';
}

/**
 * The requirement codes a refused publish named, or an empty list.
 *
 * Read from the envelope's structured `errors` array — the one place a client
 * reads structured detail from — and only for the not-ready refusal. The codes
 * are used to *emphasise* rows the panel already renders from the refetched
 * record; they never author a message, and the `message` beside them is never
 * displayed.
 */
export function publicationRequirementCodes(error: unknown): readonly string[] {
  const normalized = normalizedOf(error);
  if (normalized?.code !== GALLERY_ENTRY_PUBLICATION_NOT_READY) {
    return [];
  }
  return (normalized.fieldErrors ?? [])
    .map((detail) => detail.code)
    .filter((code): code is string => typeof code === 'string' && code !== '');
}

/**
 * Why an image's bytes could not be shown.
 *
 * A preview is decoration around a row that is already truthful without it, so
 * both bands render the same neutral tile and neither is an alert: a missing
 * image must never be mistaken for a missing selection, and it must never fail
 * the editor around it.
 */
export type GalleryPreviewFailure = 'absent' | 'unavailable';

export function classifyPreviewFailure(error: unknown): GalleryPreviewFailure {
  return normalizedOf(error)?.httpStatus === HTTP_NOT_FOUND ? 'absent' : 'unavailable';
}
