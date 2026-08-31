/**
 * The only error type the gallery-list services throw, and how it is read.
 *
 * It carries the normalized envelope error and nothing else, so no Axios
 * instance, request config or raw server message can travel with it into React
 * state. Every operator-facing string is chosen by the classification alone —
 * the server `message`, `code` and `requestId` are never read for display.
 */
import type { NormalizedApiError } from '@embroidery/api-client';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;

export class GalleryListApiError extends Error {
  readonly normalized: NormalizedApiError;

  constructor(normalized: NormalizedApiError) {
    super('An Admin gallery API call failed.');
    this.name = 'GalleryListApiError';
    this.normalized = normalized;
  }
}

export function isGalleryListApiError(error: unknown): error is GalleryListApiError {
  return error instanceof GalleryListApiError;
}

/**
 * Why the list could not be read.
 *
 * - **unauthenticated** — `401`. Nothing but signing in again will help, so no
 *   retry is offered: none could succeed.
 * - **retryable** — everything else, including every `5xx`. The platform
 *   replaces a `5xx` code and message with a generic pair, so this is the one
 *   band where a second attempt can genuinely differ.
 *
 * There is deliberately no rejected-cursor band: `APP11-B01` publishes no
 * cursor-invalid code, and inventing a classification for a refusal the
 * contract does not define would put a recovery on screen the server never
 * asked for. A stale cursor therefore lands in `retryable`, whose retry
 * re-sends the same cursor — which is exactly what the approved continuation
 * behaviour asks for.
 *
 * A read is idempotent, so there is no "ambiguous" band: a dropped connection
 * on a `GET` changed nothing, and retrying it is safe.
 */
export type GalleryListFailure = 'unauthenticated' | 'retryable';

export function classifyGalleryListFailure(error: unknown): GalleryListFailure {
  if (!isGalleryListApiError(error)) return 'retryable';
  return error.normalized.httpStatus === HTTP_UNAUTHORIZED ? 'unauthenticated' : 'retryable';
}

/**
 * Why a cover thumbnail could not be shown.
 *
 * A cover is decoration around a row that is already truthful without it, so
 * both bands render the same neutral tile and neither is an alert: a missing
 * image must never be mistaken for a missing entry, and it must never fail the
 * list around it.
 *
 * `absent` is the one band worth naming separately. `APP11-B03A` re-checks the
 * asset lane on every request, so a `404` means the image is no longer a
 * `GALLERY_MEDIA` / `PUBLIC` asset this operator may preview — a fact about the
 * asset, not a transient transport failure — and retrying it cannot succeed.
 */
export type GalleryCoverFailure = 'absent' | 'unavailable';

export function classifyGalleryCoverFailure(error: unknown): GalleryCoverFailure {
  if (!isGalleryListApiError(error)) return 'unavailable';
  return error.normalized.httpStatus === HTTP_NOT_FOUND ? 'absent' : 'unavailable';
}
