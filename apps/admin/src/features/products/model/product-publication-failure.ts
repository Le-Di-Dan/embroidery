/**
 * Classification of a publication command failure.
 *
 * The exact domain code is the only authority. Every publication refusal the
 * server issues is HTTP `409` — a stale token, an unmet requirement and a
 * forbidden lifecycle state all arrive with the same status — so branching on
 * `409` would collapse three outcomes that need three different responses. Only
 * `PRODUCT_VERSION_CONFLICT` may open the reload dialog, because reloading is
 * the only one of the three that reload actually fixes.
 *
 * An unrecognised code is `generic`. That is the safe direction: a screen that
 * guessed would either offer a destructive reload for a problem reload cannot
 * fix, or tell the operator a requirement failed when the server said something
 * else entirely.
 *
 * Nothing here reads the server's `message`, `requestId` or `httpStatus` for
 * display. The approved copy is fixed per classification.
 */
import { AdminProductRequirementResponseCode } from '@embroidery/api-client';
import type { NormalizedApiError } from '@embroidery/api-client';

import { isProductApiError } from './product-failure';
import { PRODUCT_VERSION_CONFLICT_CODE } from './product-conflict';

/** Not every requirement is met — re-evaluated inside the command transaction. */
export const PRODUCT_PUBLICATION_NOT_READY_CODE = 'PRODUCT_PUBLICATION_NOT_READY';
/** The product is not in a state publish may leave (`TR-LC04-01`). */
export const PRODUCT_PUBLISH_NOT_ALLOWED_CODE = 'PRODUCT_PUBLISH_NOT_ALLOWED';
/** The product is not in a state unpublish may leave (`TR-LC04-05`). */
export const PRODUCT_UNPUBLISH_NOT_ALLOWED_CODE = 'PRODUCT_UNPUBLISH_NOT_ALLOWED';

/**
 * What the operator is facing, and therefore which approved message and which
 * recovery the screen offers.
 */
export type PublicationFailure =
  'version-conflict' | 'not-ready' | 'publish-not-allowed' | 'unpublish-not-allowed' | 'generic';

/** The subset that has its own approved message; `version-conflict` uses the dialog. */
export type PublicationCommandFailure = Exclude<PublicationFailure, 'version-conflict'>;

function normalizedOf(error: unknown): NormalizedApiError | null {
  return isProductApiError(error) ? error.normalized : null;
}

export function classifyPublicationFailure(error: unknown): PublicationFailure {
  switch (normalizedOf(error)?.code) {
    case PRODUCT_VERSION_CONFLICT_CODE:
      return 'version-conflict';
    case PRODUCT_PUBLICATION_NOT_READY_CODE:
      return 'not-ready';
    case PRODUCT_PUBLISH_NOT_ALLOWED_CODE:
      return 'publish-not-allowed';
    case PRODUCT_UNPUBLISH_NOT_ALLOWED_CODE:
      return 'unpublish-not-allowed';
    default:
      return 'generic';
  }
}

/**
 * True only for the exact version conflict — the single gate on the approved
 * A03 reload dialog, kept as narrow as it can be.
 */
export function isPublicationVersionConflict(error: unknown): boolean {
  return classifyPublicationFailure(error) === 'version-conflict';
}

const KNOWN_REQUIREMENT_CODES: ReadonlySet<string> = new Set(
  Object.values(AdminProductRequirementResponseCode),
);

/**
 * The requirement codes carried by a `PRODUCT_PUBLICATION_NOT_READY` refusal.
 *
 * Only codes this build recognises are returned. An unrecognised entry is
 * dropped rather than rendered: the screen has no safe text for it, and echoing
 * the raw code would put a backend identifier in front of the operator. Nothing
 * is inferred from the accompanying `message`, which is a server string.
 *
 * The result is advisory. The authoritative list is always the refetched
 * readiness report — this only lets the screen highlight what the command
 * itself objected to, in the contract's own order rather than the server's
 * arbitrary detail order.
 */
export function unmetRequirementCodesFrom(
  error: unknown,
): readonly (typeof AdminProductRequirementResponseCode)[keyof typeof AdminProductRequirementResponseCode][] {
  const reported = new Set(
    (normalizedOf(error)?.fieldErrors ?? [])
      .map((entry) => entry.code)
      .filter(
        (code): code is string => typeof code === 'string' && KNOWN_REQUIREMENT_CODES.has(code),
      ),
  );

  return Object.values(AdminProductRequirementResponseCode).filter((code) => reported.has(code));
}
